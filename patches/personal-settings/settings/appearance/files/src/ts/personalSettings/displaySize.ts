/** Display only: storage limits and validation retain exact byte counts. */
export const displaySize = (bytes: number): string => bytes >= 1_000_000
    ? `${(bytes / 1_000_000).toFixed(1)} MB`
    : `${(bytes / 1_000).toFixed(1)} KB`
