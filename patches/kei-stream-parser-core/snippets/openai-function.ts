function getTranStream(arg:RequestDataArgumentExtended):TransformStream<Uint8Array, StreamResponseChunk> {
    /* POCKETRISU-PATCH:kei-stream-parser:{{ADAPTER}}:openai-transform */
    const parser = new KeiSseStreamParser()
    const readed:{[key:string]:string} = {}
    const toolCallsData:{[key:string]:any} = {}
    const db = getDatabase()
    let reasoningContent = ""
    let reasoningFromStructured = false
    let streamDone = false

    const appendStreamingFragment = (current:string, incoming?:string) => {
        if(!incoming){
            return current
        }
        if(incoming.length > current.length && incoming.startsWith(current)){
            return incoming
        }
        return current + incoming
    }

    const buildReadableState = () => {
        const current:{[key:string]:string} = { ...readed }
        if(Object.keys(toolCallsData).length > 0){
            current["__tool_calls"] = JSON.stringify(toolCallsData)
        }
        return current
    }

    const emit = (control:TransformStreamDefaultController<StreamResponseChunk>) => {
        const current = buildReadableState()
        let currentReasoningContent = reasoningContent

        if(arg.modelInfo.flags.includes(LLMFlags.deepSeekThinkingOutput) && !reasoningFromStructured){
            current["0"] = (current["0"] ?? '').replace(/(.*)\<\/think\>/gms, (m, p1) => {
                currentReasoningContent = p1
                return ""
            })

            if(currentReasoningContent){
                currentReasoningContent = currentReasoningContent.replace(/\<think\>/gm, '')
            }
        }

        if(arg.extractJson && (db.jsonSchemaEnabled || arg.schema)){
            const JSONreaded:{[key:string]:string} = {}
            for(const key in current){
                JSONreaded[key] = extractJSON(current[key], arg.extractJson)
            }
            console.log(JSONreaded)
            control.enqueue(JSONreaded)
        }
        else if(currentReasoningContent){
            const chunk:Record<string,string> = {
                "0": `<Thoughts>\n${currentReasoningContent}\n</Thoughts>\n${current["0"] ?? ''}`,
            }
            if(current["__tool_calls"]){
                chunk["__tool_calls"] = current["__tool_calls"]
            }
            control.enqueue(chunk)
        }
        else{
            control.enqueue(current)
        }
    }

    const applyStreamData = (rawChunk:string) => {
        if(rawChunk.trim() === "[DONE]"){
            streamDone = true
            return true
        }

        try {
            const parsed = JSON.parse(rawChunk)
            if(!Array.isArray(parsed?.choices)){
                return false
            }
            for(const choice of parsed.choices){
                const chunk = choice?.delta?.content ?? choice?.text
                if(chunk){
                    const index = arg.multiGen ? String(choice?.index ?? 0) : "0"
                    readed[index] = appendStreamingFragment(readed[index] ?? "", chunk)
                }
                if(Array.isArray(choice?.delta?.tool_calls)){
                    for(const toolCall of choice.delta.tool_calls) {
                        const index = toolCall.index ?? 0
                        if(!toolCallsData[index]) {
                            toolCallsData[index] = {
                                id: toolCall.id || null,
                                type: 'function',
                                function: {
                                    name: null,
                                    arguments: ''
                                }
                            }
                        }
                        if(toolCall.id) {
                            toolCallsData[index].id = toolCall.id
                        }
                        if(toolCall.function?.name) {
                            toolCallsData[index].function.name = toolCall.function.name
                        }
                        if(toolCall.function?.arguments) {
                            toolCallsData[index].function.arguments = appendStreamingFragment(
                                toolCallsData[index].function.arguments,
                                toolCall.function.arguments,
                            )
                        }
                    }
                }
                const reasoningChunk = choice?.delta?.reasoning_content ?? choice?.delta?.reasoning
                if(reasoningChunk){
                    reasoningFromStructured = true
                    reasoningContent = appendStreamingFragment(reasoningContent, reasoningChunk)
                }
            }
            return true
        } catch {
            return false
        }
    }

    const processEvents = (
        events:ReturnType<KeiSseStreamParser["push"]>,
        control:TransformStreamDefaultController<StreamResponseChunk>,
    ) => {
        let updated = false
        for(const event of events){
            updated = applyStreamData(event.data) || updated
            if(streamDone){
                emit(control)
                return
            }
        }
        if(updated){
            emit(control)
        }
    }

    return new TransformStream<Uint8Array, StreamResponseChunk>({
        transform(chunk, control) {
            if(streamDone) return
            processEvents(parser.push(chunk), control)
        },
        flush(control) {
            if(streamDone) return
            processEvents(parser.finish(), control)
        }
    })
}

export const __testOpenAIRequestsAPI = {
    getTranStream,
}
