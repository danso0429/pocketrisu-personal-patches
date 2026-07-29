import { additionalHamburgerMenu } from "./stores.svelte"

const MENU_ID = "builtin-character-organizer"

export const characterOrganizerState = $state({
    open: false,
})

if (!additionalHamburgerMenu.some((menu) => menu.id === MENU_ID)) {
    additionalHamburgerMenu.push({
        id: MENU_ID,
        name: "Character organizer",
        iconType: "html",
        icon: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h6l2 2h10v10H3z"/><path d="M8 14h8"/><path d="M12 10v8"/></svg>`,
        callback: () => {
            characterOrganizerState.open = true
        },
    })
}
