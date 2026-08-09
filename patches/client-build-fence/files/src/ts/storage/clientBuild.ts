export const CLIENT_BUILD_HEADER = 'x-client-build'

export const clientBuildStamp = typeof __CLIENT_BUILD_STAMP__ !== 'undefined'
    ? __CLIENT_BUILD_STAMP__
    : 'development-client-build'

export function withClientBuildHeader(headers?: HeadersInit): Headers {
    const next = new Headers(headers)
    next.set(CLIENT_BUILD_HEADER, clientBuildStamp)
    return next
}
