import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Select } from 'primeng/select';
import { TranslatePipe } from '@ngx-translate/core';

import { ActiveProjectStore } from '../../services';

/** Selector del proyecto activo: todo lo generado se asigna a este proyecto. */
@Component({
  selector: 'app-active-project-picker',
  imports: [FormsModule, Select, TranslatePipe],
  template: `
    <p-select
      inputId="activeProjectPicker"
      [attr.aria-label]="'PROJECTS.ACTIVE_PROJECT' | translate"
      [options]="store.options()"
      optionLabel="label"
      optionValue="value"
      [ngModel]="store.projectId()"
      (ngModelChange)="onChange($event)"
      [ngModelOptions]="{ standalone: true }"
      [placeholder]="'PROJECTS.ACTIVE_PROJECT_NONE' | translate"
      [showClear]="true"
      [filter]="true"
      [loading]="store.loading()"
      styleClass="w-full"
      appendTo="body"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActiveProjectPickerComponent {
  protected readonly store = inject(ActiveProjectStore);

  protected onChange(projectId: string | null): void {
    if (!projectId) {
      this.store.clear();
      return;
    }
    const project = this.store.projects().find((item) => item.id === projectId) ?? null;
    this.store.select(project);
  }
}
