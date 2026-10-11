import { afterEach, expect, it, vi } from 'vitest'
vi.mock('src/ts/alert', () => ({ notifyError: vi.fn() }))
import { notifyError } from 'src/ts/alert'
import { clearPublicationSaveBlockedNotice, notifyPublicationSaveBlocked, retainPublicationJobNotices } from './publicationSaveNotice'
afterEach(() => { retainPublicationJobNotices([]); clearPublicationSaveBlockedNotice(); vi.clearAllMocks() })
it('coalesces notifications from autosave and job recovery until a confirmed save clears the notice', () => {
    notifyPublicationSaveBlocked('blocked autosave')
    notifyPublicationSaveBlocked('blocked job recovery')
    expect(notifyError).toHaveBeenCalledTimes(1)
    expect(notifyError).toHaveBeenLastCalledWith('blocked autosave')
    clearPublicationSaveBlockedNotice()
    notifyPublicationSaveBlocked('new blocked save')
    expect(notifyError).toHaveBeenCalledTimes(2)
    expect(notifyError).toHaveBeenLastCalledWith('new blocked save')
})
it('does not repeat a job-only notice after an unrelated autosave and prunes retired job identities', () => {
    notifyPublicationSaveBlocked('job one blocked', 'job-1')
    notifyPublicationSaveBlocked('job two blocked', 'job-2')
    clearPublicationSaveBlockedNotice()
    clearPublicationSaveBlockedNotice('job-1')
    notifyPublicationSaveBlocked('job two still blocked', 'job-2')
    expect(notifyError).toHaveBeenCalledTimes(1)
    retainPublicationJobNotices([])
    notifyPublicationSaveBlocked('new job blocked', 'job-3')
    expect(notifyError).toHaveBeenCalledTimes(2)
})
