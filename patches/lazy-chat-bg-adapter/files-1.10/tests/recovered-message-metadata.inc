    test('recovery omits unavailable metadata instead of persisting undefined keys', async () => {
        const { recovery } = await loadModules()
        const chat = makeChat()
        mocks.db.characters = [makeChar(chat)]
        setupServer({ journals: { 'job-1': OPENAI_SSE } })
        await recovery.recoverTerminalJob(makeJob({ model: null }) as any)
        expect(chat.message[0].generationInfo).toEqual({ generationId: 'gen-1' })
        expect(Object.hasOwn(chat.message[0].generationInfo, 'model')).toBe(false)
        expect(Object.hasOwn(chat.message[0].generationInfo, 'inputTokens')).toBe(false)
    })

    test('recovery preserves recorded model and decoded token usage including zero', async () => {
        const { recovery } = await loadModules()
        const chat = makeChat()
        mocks.db.characters = [makeChar(chat)]
        const journal = 'data: {"choices":[{"delta":{"content":"Hello"}}],"usage":{"prompt_tokens":12,"completion_tokens":0}}\n\n'
            + 'data: [DONE]\n\n'
        const { claims } = setupServer({ journals: { 'job-1': journal } })
        await recovery.recoverTerminalJob(makeJob({ model: 'recorded-model' }) as any)
        expect(chat.message[0].generationInfo).toEqual({
            generationId: 'gen-1', model: 'recorded-model', inputTokens: 12, outputTokens: 0,
        })
        expect(chat.message[0].data).toBe('Hello')
        expect(claims()).toEqual(['/api/model-jobs/job-1/claim'])
    })
