import { add, multiply } from "./math.js";

export class Calculator {
  private value: number = 0;

  constructor(initial: number = 0) {
    this.value = initial;
  }

  public add(n: number): number {
    this.value = add(this.value, n);
    return this.value;
  }

  public multiply(n: number): number {
    this.value = multiply(this.value, n);
    return this.value;
  }

  public getValue(): number {
    return this.value;
  }
}

export interface Config {
  apiUrl: string;
  timeout: number;
}
