export async function retryAI<T>(
  operation: () => Promise<T>,
  onRetry: (attempt: number) => void,
  wait: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (attempt === 3) throw error
      onRetry(attempt + 1)
      await wait(attempt * 1000)
    }
  }
  throw new Error('AI attempts exhausted')
}
