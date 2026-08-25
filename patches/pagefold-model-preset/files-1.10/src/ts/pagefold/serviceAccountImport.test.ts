import { describe, expect, it } from 'vitest'
import type { ModelPreset } from 'src/ts/preset/types'
import {
    SERVICE_ACCOUNT_IMPORT_MAX_BYTES,
    applyServiceAccountImport,
    planServiceAccountFileImport,
} from './serviceAccountImport'

const privateKey = '-----BEGIN PRIVATE KEY-----\nTEST_KEY_MATERIAL\n-----END PRIVATE KEY-----\n'
const validJson = JSON.stringify({
    type: 'service_account',
    project_id: 'project-safe-1',
    private_key_id: 'key-id-safe',
    private_key: privateKey,
    client_email: 'service-account@example.invalid',
    token_uri: 'https://oauth2.googleapis.com/token',
})

function preset(): ModelPreset {
    return {
        id: 'p', name: 'Vertex', createdAt: 1, updatedAt: 2,
        apiKeyRef: 'stale-pool-id', inlineCredential: { key: 'stale-inline' },
        userValues: { serviceAccountJson: 'old-direct', projectId: 'old-project', location: 'global' },
        profileSnapshot: {
            profileId: 'vertex-gemini-native:gemini-37-flash', profileVersion: 1,
            providerBaseId: 'vertex-gemini-native', providerBaseVersion: 7,
            adapterKind: 'google-gemini', endpoint: { kind: 'vertex-gemini' },
            auth: { kind: 'google-service-account', fields: ['serviceAccountJson'] },
            modelId: 'gemini-3.7-flash', defaults: {}, uiSchema: { groups: [], fields: [] },
            schema: [
                { key: 'serviceAccountJson', type: 'string', label: 'SA', mapsTo: { target: 'auth', path: 'apiKey' } },
                { key: 'projectId', type: 'string', label: 'Project', mapsTo: { target: 'custom', path: 'project' } },
                { key: 'location', type: 'string', label: 'Location', mapsTo: { target: 'custom', path: 'location' } },
            ],
        },
    }
}

describe('Google Service Account JSON file import', () => {
    it.each([
        ['application/json', 'service-account.json'],
        ['', 'service-account.json'],
    ])('validates %s MIME, then atomically replaces higher-precedence credentials', async (type, name) => {
        const target = preset()
        const plan = await planServiceAccountFileImport(new File([validJson], name, { type }), target, 'serviceAccountJson')
        expect(plan).toMatchObject({
            projectId: 'project-safe-1',
            projectFieldKey: 'projectId',
            summary: { clientEmail: 'service-account@example.invalid', privateKeyId: 'key-id-safe' },
        })
        applyServiceAccountImport(target, plan)
        expect(target.apiKeyRef).toBeUndefined()
        expect(target.inlineCredential).toBeUndefined()
        expect(target.userValues).toMatchObject({
            serviceAccountJson: validJson,
            projectId: 'project-safe-1',
            location: 'global',
        })
    })

    it.each([
        [new File([''], 'empty.json', { type: 'application/json' }), 'empty'],
        [new File([validJson], 'credential.txt', { type: 'text/plain' }), '.json'],
        [new File(['x'.repeat(SERVICE_ACCOUNT_IMPORT_MAX_BYTES + 1)], 'large.json', { type: 'application/json' }), '262144'],
        [new File([validJson.replace('project-safe-1', '')], 'missing-project.json', { type: 'application/json' }), 'project_id'],
        [new File([validJson.replace('https://oauth2.googleapis.com/token', 'http://127.0.0.1/token')], 'hostile.json', { type: 'application/json' }), 'allowed set'],
    ])('does not mutate the preset when validation fails', async (file, message) => {
        const target = preset()
        const before = structuredClone(target)
        await expect(planServiceAccountFileImport(file, target, 'serviceAccountJson')).rejects.toThrow(message)
        expect(target).toEqual(before)
    })

    it('does not expose private-key content in an import error', async () => {
        const target = preset()
        const hostile = JSON.stringify({
            type: 'service_account', project_id: 'p', client_email: 'x@example.invalid',
            private_key: 'SECRET_PRIVATE_BODY', token_uri: 'https://oauth2.googleapis.com/token',
        })
        let message = ''
        try {
            await planServiceAccountFileImport(
                new File([hostile], 'hostile.json', { type: 'application/json' }),
                target,
                'serviceAccountJson',
            )
        } catch (error) {
            message = error instanceof Error ? error.message : String(error)
        }
        expect(message).not.toContain('SECRET_PRIVATE_BODY')
        expect(message).not.toContain(privateKey)
    })
})
