import { isDevMode } from '@angular/core';

export const logDev = (description: string, data: any): void => {
  if (isDevMode()) {
    console.log(description, data);
  }
};

export const logError = (description: string, data: any): void => {
  if (isDevMode()) {
    console.error(description, data);
  }
};

export const logWarning = (description: string, data: any): void => {
  if (isDevMode()) {
    console.warn(description, data);
  }
};
