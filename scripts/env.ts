// Render supplies environment variables; load local overrides only for development.
try { process.loadEnvFile('.env.local') } catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
}
