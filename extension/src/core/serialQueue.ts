/** Operations may have side effects even when they reject. Never retry writes. */
export class SerialQueue {
  private tail:Promise<unknown>=Promise.resolve();
  run<T>(work:()=>Promise<T>):Promise<T>{
    const result=this.tail.then(work);
    this.tail=result.catch(()=>undefined);
    return result;
  }
}
