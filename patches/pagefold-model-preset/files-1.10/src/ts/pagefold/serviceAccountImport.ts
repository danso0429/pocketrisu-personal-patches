import { ModelPresetAdapterError } from 'src/ts/preset/adapter/error'
import { parseServiceAccountJson } from 'src/ts/preset/adapter/googleServiceAccount/serviceAccount'
import type { ModelPreset } from 'src/ts/preset/types'

export const SERVICE_ACCOUNT_IMPORT_MAX_BYTES = 262_144

export interface ServiceAccountImportPlan {
    credentialFieldKey: string
    projectFieldKey: string
    sourceJson: string
    projectId: string
    summary: {
        clientEmail: string
        privateKeyId?: string
    }
}

export async function planServiceAccountFileImport(
    file: File,
    preset: ModelPreset,
    credentialFieldKey: string,
): Promise<ServiceAccountImportPlan> {
    if (!(file instanceof File)) throw invalid('No Service Account JSON file was selected')
    const name = file.name.toLowerCase()
    const type = file.type.toLowerCase()
    if (!(type === 'application/json' || (type === '' && name.endsWith('.json')) || name.endsWith('.json'))) {
        throw invalid('Service Account import requires a .json file')
    }
    if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > SERVICE_ACCOUNT_IMPORT_MAX_BYTES) {
        throw invalid('Service Account JSON file is empty or exceeds 262144 bytes')
    }
    let sourceJson: string
    try {
        sourceJson = await file.text()
    } catch {
        throw invalid('Service Account JSON file could not be read')
    }
    const bytes = new TextEncoder().encode(sourceJson).byteLength
    if (bytes < 1 || bytes > SERVICE_ACCOUNT_IMPORT_MAX_BYTES) {
        throw invalid('Service Account JSON text is empty or exceeds 262144 UTF-8 bytes')
    }
    const credentialField = preset.profileSnapshot.schema.find((field) =>
        field.key === credentialFieldKey
        && field.mapsTo?.target === 'auth'
    )
    if (!credentialField || preset.profileSnapshot.auth.kind !== 'google-service-account') {
        throw invalid('The selected preset field is not a Google Service Account credential')
    }
    const projectField = preset.profileSnapshot.schema.find((field) =>
        field.mapsTo?.target === 'custom' && field.mapsTo.path === 'project'
    )
    if (!projectField) throw invalid('The Vertex preset has no mapped Project ID field')

    const parsed = parseServiceAccountJson(sourceJson)
    if (!parsed.projectId) throw invalid('Service Account JSON is missing field project_id')
    return {
        credentialFieldKey,
        projectFieldKey: projectField.key,
        sourceJson,
        projectId: parsed.projectId,
        summary: {
            clientEmail: parsed.clientEmail,
            ...(parsed.privateKeyId ? { privateKeyId: parsed.privateKeyId } : {}),
        },
    }
}

/** Apply a fully validated plan without parsing or any fallible external work. */
export function applyServiceAccountImport(
    preset: ModelPreset,
    plan: ServiceAccountImportPlan,
): void {
    const nextUserValues = {
        ...preset.userValues,
        [plan.credentialFieldKey]: plan.sourceJson,
        [plan.projectFieldKey]: plan.projectId,
    }
    preset.apiKeyRef = undefined
    preset.inlineCredential = undefined
    preset.userValues = nextUserValues
}

function invalid(message: string): ModelPresetAdapterError {
    return new ModelPresetAdapterError('invalid-request', message, {
        retryable: false,
        fallbackEligible: false,
    })
}
