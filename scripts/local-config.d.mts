export const projectRoot: string
export function assertLocalDeploymentSelection(): void
export function prepareDockerEnvironment(): Record<string, string>
export function assertPostgresConfiguration(
  configuration: Record<string, string>
): void
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

export const backendUrl: string
export const backendSiteUrl: string
export const siteUrl: string
export const dashboardUrl: string
export const mailpitUrl: string
export const spotlightUrl: string
export function localPorts(
  configuration?: Record<string, string>
): Record<string, string>
