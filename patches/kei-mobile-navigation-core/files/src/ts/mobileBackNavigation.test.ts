import { describe, expect, it, vi } from 'vitest'
import { createMobileBackNavigationGuard } from './mobileBackNavigation'

function createHarness(
    initialState: unknown = null,
    hasUserActivation: () => boolean = () => true,
    ownsBeforeUnload = true,
) {
    let state = initialState
    const listeners = new Map<string, Set<(event?: Event) => void>>()
    const browserHistory = {
        get state() {
            return state
        },
        back: vi.fn(),
        pushState: vi.fn((nextState: unknown) => {
            state = nextState
        }),
    }
    const eventTarget = {
        addEventListener: vi.fn((
            type: string,
            listener: (event?: Event) => void,
        ) => {
            const typeListeners = listeners.get(type) ?? new Set()
            typeListeners.add(listener)
            listeners.set(type, typeListeners)
        }),
        removeEventListener: vi.fn((
            type: string,
            listener: (event?: Event) => void,
        ) => {
            listeners.get(type)?.delete(listener)
        }),
    }
    const guard = createMobileBackNavigationGuard(
        browserHistory as unknown as
            Parameters<typeof createMobileBackNavigationGuard>[0],
        eventTarget as unknown as
            Parameters<typeof createMobileBackNavigationGuard>[1],
        hasUserActivation,
        ownsBeforeUnload,
    )

    return {
        browserHistory,
        eventTarget,
        guard,
        dispatch(type: string, event?: Event) {
            for (const listener of listeners.get(type) ?? []) listener(event)
        },
        navigateBackTo(nextState: unknown) {
            state = nextState
            for (const listener of listeners.get('popstate') ?? []) listener()
        },
    }
}

describe('mobile back navigation guard', () => {
    it('adds one same-page guard entry and restores it after back', () => {
        const harness = createHarness({ route: 'chat' })

        harness.guard.setEnabled(true)
        expect(harness.browserHistory.pushState).toHaveBeenCalledTimes(1)
        expect(harness.browserHistory.state).toMatchObject({
            route: 'chat',
            __pocketRisuMobileBackGuard: true,
        })

        harness.guard.setEnabled(true)
        expect(harness.browserHistory.pushState).toHaveBeenCalledTimes(1)

        harness.navigateBackTo({ route: 'chat' })
        expect(harness.browserHistory.pushState).toHaveBeenCalledTimes(2)
    })

    it('removes its guard when disabled without immediately rearming', () => {
        const harness = createHarness()

        harness.guard.setEnabled(true)
        harness.guard.setEnabled(false)
        expect(harness.browserHistory.back).toHaveBeenCalledTimes(1)

        harness.navigateBackTo(null)
        expect(harness.browserHistory.pushState).toHaveBeenCalledTimes(1)
    })

    it('does not queue duplicate cleanup while a back operation is pending', () => {
        const harness = createHarness()

        harness.guard.setEnabled(true)
        harness.guard.setEnabled(false)
        harness.guard.setEnabled(true)
        harness.guard.setEnabled(false)

        expect(harness.browserHistory.back).toHaveBeenCalledTimes(1)
        harness.navigateBackTo(null)
        expect(harness.browserHistory.pushState).toHaveBeenCalledTimes(1)
    })

    it('waits for user activation before creating a boot-time guard', () => {
        let activated = false
        const harness = createHarness(null, () => activated)

        harness.guard.setEnabled(true)
        expect(harness.browserHistory.pushState).not.toHaveBeenCalled()

        activated = true
        harness.dispatch('pointerdown')
        expect(harness.browserHistory.pushState).toHaveBeenCalledTimes(1)
    })

    it('cancels unload only while enabled', () => {
        const harness = createHarness()
        const enabledEvent = new Event(
            'beforeunload',
            { cancelable: true },
        ) as BeforeUnloadEvent

        harness.guard.setEnabled(true)
        harness.dispatch('beforeunload', enabledEvent)
        expect(enabledEvent.defaultPrevented).toBe(true)

        harness.guard.setEnabled(false)
        const disabledEvent = new Event(
            'beforeunload',
            { cancelable: true },
        ) as BeforeUnloadEvent
        harness.dispatch('beforeunload', disabledEvent)
        expect(disabledEvent.defaultPrevented).toBe(false)
    })

    it('leaves unload handling to an upstream owner when configured', () => {
        const harness = createHarness(null, () => true, false)
        const event = new Event(
            'beforeunload',
            { cancelable: true },
        ) as BeforeUnloadEvent

        harness.guard.setEnabled(true)
        harness.dispatch('beforeunload', event)

        expect(event.defaultPrevented).toBe(false)
        expect(harness.eventTarget.addEventListener).not.toHaveBeenCalledWith(
            'beforeunload',
            expect.any(Function),
        )
    })

    it('bounds persistent push failure to one attempt per enable cycle', () => {
        const harness = createHarness()
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        harness.browserHistory.pushState.mockImplementation(() => {
            throw new DOMException('inactive document', 'SecurityError')
        })
        const unloadEvent = new Event(
            'beforeunload',
            { cancelable: true },
        ) as BeforeUnloadEvent

        expect(() => harness.guard.setEnabled(true)).not.toThrow()
        harness.dispatch('pointerdown')
        harness.dispatch('keydown')
        harness.dispatch('beforeunload', unloadEvent)

        expect(unloadEvent.defaultPrevented).toBe(true)
        expect(harness.browserHistory.pushState).toHaveBeenCalledTimes(1)
        expect(warn).toHaveBeenCalledTimes(1)

        harness.guard.setEnabled(false)
        harness.guard.setEnabled(true)
        expect(harness.browserHistory.pushState).toHaveBeenCalledTimes(2)
        expect(warn).toHaveBeenCalledTimes(2)
        warn.mockRestore()
    })

    it('stops reacting after destruction', () => {
        const harness = createHarness()

        harness.guard.setEnabled(true)
        harness.guard.destroy()
        harness.navigateBackTo(null)

        expect(harness.eventTarget.removeEventListener).toHaveBeenCalled()
        expect(harness.browserHistory.pushState).toHaveBeenCalledTimes(1)
    })
})
