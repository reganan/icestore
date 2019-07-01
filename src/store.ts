
import * as isFunction from 'lodash.isfunction';
import { useState, useEffect } from 'react';

interface MethodFunc {
  (): void;
}

export default class Store {
  private state: {[name: string]: any} = {};

  private methods: {[name: string]: MethodFunc} = {};

  private queue = [];

  public constructor(bindings: object) {
    Object.keys(bindings).forEach((key) => {
      const value = bindings[key];

      if (isFunction(value)) {
        this.methods[key] = this.createMethod(value);
      } else {
        this.state[key] = value;
      }
    });
  }

  private getBindings() {
    return { ...this.state, ...this.methods };
  }

  private createMethod(fun): MethodFunc {
    return async (...args) => {
      const newState = { ...this.state };
      await fun.apply(newState, args);
      this.setState(newState);
      return this.getBindings();
    };
  }

  private setState(newState: object): void {
    this.state = newState;
    this.queue.forEach(setState => setState(newState));
  }

  public useStore(): object {
    const [, setState] = useState(this.state);
    useEffect(() => {
      this.queue.push(setState);
      return () => {
        const index = this.queue.indexOf(setState);
        this.queue.splice(index, 1);
      };
    }, []);

    return this.getBindings();
  }
}
