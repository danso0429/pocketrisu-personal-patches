import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const marpAgents = ['worldbuilding', 'plot', 'character'];

// Shared S1/lifecycle seed. This changes only an independent synthetic root.
export function configureMarpFixture(data, original, { disabled = false, enabledAgents = marpAgents } = {}) {
    const script = fs.readFileSync(path.resolve(original), 'utf8');
    data.plugins = [{ name: 'risu_multiagent', version: '3.0', enabled: !disabled, realArg: {}, script }];
    data.pluginCustomStorage = { risu_multiagent_lite_config_vault_v1: { config: {
        provider: 'openai', baseUrl: 'https://analysis.example.test/v1', apiKey: 'synthetic-only', model: 'g110-default',
        marpConfig: { request_timeout: 60, analysis_timeout: 120 },
        agents: Object.fromEntries(marpAgents.map(agent => [agent, { enabled: enabledAgents.includes(agent),
            model: agent === 'character' ? '' : 'g110-' + agent }])),
    } } };
    assert.equal(data.modelPresets.length, 1, 'Synthetic fixture must have one independently selected preset');
    const preset = data.modelPresets[0];
    assert.equal(preset.profileSnapshot.endpoint.url, 'https://native-input.example.test/v1/chat/completions');
    assert.equal(preset.profileSnapshot.modelId, 'synthetic-model');
    preset.useStreaming = true;
    data.useStreaming = false;
    data.nodeOnlyModelModeLock = 'none';
    data.characters[0].chats[0].useModelPreset = true;
    data.characters[0].chats[0].modelBinding = { main: preset.id, sub: preset.id, separateAux: false,
        aux: { memory: '', emotion: '', translate: '', otherAx: '' } };
}

export function marpGrants(data) {
    const grants = ['replacer', 'mainDom', 'db'].map(permission => JSON.stringify([data.plugins[0].name, permission]));
    return { given: grants, denied: [], cache: grants.map(key => [key + '_lastGrantTime', Date.now()]) };
}

export function readMarpExpectations(persisted, original) {
    const config = persisted.pluginCustomStorage.risu_multiagent_lite_config_vault_v1.config;
    const expectedModels = persisted.plugins[0].enabled ? marpAgents.filter(agent => config.agents[agent].enabled)
        .map(agent => config.agents[agent].model || config.model) : [];
    const originalHash = createHash('sha256').update(persisted.plugins[0].script).digest('hex');
    assert.equal(originalHash, createHash('sha256').update(fs.readFileSync(original)).digest('hex'));
    return { expectedModels, originalHash };
}
