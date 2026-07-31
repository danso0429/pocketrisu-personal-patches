function getTranStream(args:{
    modelInfo:LLMModel,
    saveSignature:boolean
}):TransformStream<Uint8Array, StreamResponseChunk> {
    /* POCKETRISU-PATCH:kei-stream-parser:{{ADAPTER}}:google-transform */
    const parser = new KeiSseStreamParser()
    const readed = initStreamState()
    const toolCallsData:GeminiFunctionCall[] = []
    const { modelInfo, saveSignature } = args
    let streamDone = false

    const buildReadableState = () => ({
        ...readed,
        "__tool_calls": JSON.stringify(toolCallsData),
    })

    const emit = (control:TransformStreamDefaultController<StreamResponseChunk>) => {
        control.enqueue(buildReadableState())
    }

    const applyStreamData = (dataStr:string) => {
        if(dataStr.trim() === '[DONE]'){
            streamDone = true
            return true
        }

        try {
            const jsonData = JSON.parse(dataStr)
            const parts = jsonData?.candidates?.[0]?.content?.parts
            if(Array.isArray(parts)){
                for(const part of parts){
                    if(part.text){
                        readed["__thoughts"] += readed["__last_thought"]
                        readed["__last_thought"] = ""
                        if(part.thought){
                            readed["__last_thought"] = part.text
                        }
                        else{
                            readed["0"] += part.text
                        }
                        if(part.thoughtSignature){
                            readed["__sign_text"] = part.thoughtSignature
                            if(saveSignature){
                                const sigId = v4()
                                void saveInlayedSignature(sigId, {
                                    source: modelInfo.internalID || modelInfo.id,
                                    sourceFormat: modelInfo.format,
                                    signatures: [{
                                        type: 'text',
                                        content: part.text,
                                    }]
                                })
                                readed["0"] += `{{inlayeddata::${sigId}}}`
                            }
                        }
                    }
                    if(part.functionCall){
                        toolCallsData.push(part.functionCall)
                        if(part.thoughtSignature){
                            readed["__sign_function"] = part.thoughtSignature
                            if(saveSignature){
                                const sigId = v4()
                                void saveInlayedSignature(sigId, {
                                    source: modelInfo.internalID || modelInfo.id,
                                    sourceFormat: modelInfo.format,
                                    signatures: [{
                                        type: 'function',
                                        content: `${part.functionCall.name}(${JSON.stringify(part.functionCall.args)})`,
                                    }]
                                })
                                readed["0"] += `{{inlayeddata::${sigId}}}`
                            }
                        }
                    }
                }
            }

            if(jsonData?.usageMetadata){
                readed['__usageMetadata'] = JSON.stringify(jsonData.usageMetadata)
            }
            if(jsonData?.modelStatus){
                readed['__modelStatus'] = JSON.stringify(jsonData.modelStatus)
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

export const __testGoogleRequestsAPI = {
    getTranStream,
}
