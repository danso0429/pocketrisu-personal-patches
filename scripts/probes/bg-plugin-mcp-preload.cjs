'use strict';

const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

if (process.env.POCKETRISU_D2_MCP_PROBE !== '1'
    || !process.cwd().startsWith(path.join(os.tmpdir(), 'pocketrisu-d2-mcp-'))) throw Error('Synthetic D2 MCP probe only');

const listen = http.Server.prototype.listen;
http.Server.prototype.listen = function (...args) {
    if (typeof args[1] === 'string') args[1] = '127.0.0.1';
    else args.splice(1, 0, '127.0.0.1');
    this.once('listening', () => process.send?.({ event: 'ready', port: this.address().port }));
    return listen.apply(this, args);
};

let send = 0;
const maxToolCallSend = 8;
globalThis.fetch = async (input, options) => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    const body = JSON.parse(typeof options?.body === 'string' ? options.body : Buffer.from(options?.body ?? '').toString('utf8'));
    if (url.startsWith('https://api.openai.com/v1/responses')) {
        process.send?.({ event: 'unsupported-provider', kind: 'responses', body });
        return Response.json({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'responses-final' }] }] });
    }
    if (url.startsWith('https://synthetic.invalid/d2-anthropic')) {
        process.send?.({ event: 'unsupported-provider', kind: 'anthropic-stream', body });
        const bytes = new TextEncoder().encode('event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"anthropic-final"}}\n\n');
        return new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }),
            { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }
    if (!url.startsWith('https://api.openai.com/v1/chat/completions')) {
        process.send?.({ event: 'denied-fetch', url });
        throw Error('Synthetic outbound request denied');
    }
    const toolResult = (body.messages ?? []).find(row => row.role === 'tool')?.content;
    process.send?.({ event: 'provider', send: ++send, tools: body.tools ?? null, toolResult: toolResult ?? null });
    const offersDynamicTool = Array.isArray(body.tools)
        && body.tools.some(tool => tool?.function?.name === 'dynamic_tool' || tool?.name === 'dynamic_tool');
    if (!toolResult && offersDynamicTool && send <= maxToolCallSend) {
        return Response.json({ id: `synthetic-d2-${send}`, choices: [{ index: 0, finish_reason: 'tool_calls', message: {
            role: 'assistant', content: '', tool_calls: [{ id: `call-${send}`, type: 'function',
                function: { name: 'dynamic_tool', arguments: '{"value":22}' } }],
        } }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } });
    }
    return Response.json({ id: `synthetic-d2-${send}`, choices: [{ index: 0, finish_reason: 'stop',
        message: { role: 'assistant', content: `synthetic-final:${toolResult ?? 'no-tool'}` } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
};
