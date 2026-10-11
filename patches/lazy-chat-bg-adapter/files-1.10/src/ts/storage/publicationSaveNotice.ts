import { notifyError } from 'src/ts/alert'

let shown = false
let autosaveBlocked = false
const blockedJobs = new Set<string>()

export function notifyPublicationSaveBlocked(message: string, jobId?: string): void {
    if (jobId) blockedJobs.add(jobId)
    else autosaveBlocked = true
    if (shown) return
    shown = true
    notifyError(message)
}

export function clearPublicationSaveBlockedNotice(jobId?: string): void {
    if (jobId) blockedJobs.delete(jobId)
    else autosaveBlocked = false
    if (!autosaveBlocked && blockedJobs.size === 0) shown = false
}

// Discovery supplies the complete current unclaimed/active job identities.
// Retain no historical jobs once they disappear from that authoritative list.
export function retainPublicationJobNotices(jobIds: string[]): void {
    const live = new Set(jobIds)
    for (const id of blockedJobs) if (!live.has(id)) blockedJobs.delete(id)
    if (!autosaveBlocked && blockedJobs.size === 0) shown = false
}
