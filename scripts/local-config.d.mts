export const projectRoot: string
export function assertLocalDeploymentSelection(): void
export function prepareDockerEnvironment(): Record<string, string>
export function assertDockerPortsOwnership(
  configuration: Record<string, string>
): void
export function readEnvironment(name: string): Record<string, string>
export function localDeploymentEnvironment(key: string): Record<string, string>
export function run(
  program: string,
  args: string[],
  options?: {
    capture?: boolean
    timeout?: number
    env?: Record<string, string>
  }
): string
