let instance: any = null

export function setReactFlowInstance(next: any) {
  instance = next
}

export function getReactFlowInstance(): any {
  return instance
}

