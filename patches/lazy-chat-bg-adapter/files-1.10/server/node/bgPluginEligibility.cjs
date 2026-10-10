'use strict';
function hasPluginBindings(bg) {
    const binding = bg?.bgPluginBindings, registry = binding?.registry;
    return !!binding && ['nativeFetch', 'risuFetch', 'requestChatDataMain', 'installProvider', 'characterMetadata']
        .every(key => typeof binding[key] === 'function')
        && Array.isArray(binding.allowedDbKeys) && Array.isArray(binding.bodyInterceptors)
        && registry?.providers instanceof Map
        && ['replacerbeforeRequest', 'replacerafterRequest', 'editinput', 'editoutput', 'editprocess', 'editdisplay']
            .every(key => registry[key] instanceof Set);
}
function canStartPluginHost(mode, control, dependencies, bg) {
    return mode === 'full' && hasPluginHostIdentity(dependencies)
        && control?.resultKeyVersion === 1 && control?.serverChatCommitVersion === 1
        && hasPluginBindings(bg);
}
function hasPluginHostIdentity(dependencies) {
    return dependencies?.enabled === true && typeof dependencies.storageOwner?.peekRoot === 'function';
}
module.exports = { hasPluginBindings, hasPluginHostIdentity, canStartPluginHost };
