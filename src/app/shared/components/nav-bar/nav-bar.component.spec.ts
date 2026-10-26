import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTranslateService } from '@ngx-translate/core';
import { MenuItem } from 'primeng/api';
import { Popover } from 'primeng/popover';
import { vi } from 'vitest';

import { NavBarComponent } from './nav-bar.component';

/** Acceso de test a signals protegidos. */
interface NavBarInternals {
  menuItems: () => MenuItem[];
}

describe('NavBarComponent tools popover', () => {
  let fixture: ComponentFixture<NavBarComponent>;
  let internals: NavBarInternals;
  let popover: Popover;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideTranslateService()],
    });
    // Solo el popover: evita campana, tema y menubar (servicios con back).
    TestBed.overrideComponent(NavBarComponent, {
      set: {
        template: `<p-popover #toolsPopover styleClass="tools-popover"></p-popover>`,
        imports: [Popover],
      },
    });
    fixture = TestBed.createComponent(NavBarComponent);
    internals = fixture.componentInstance as unknown as NavBarInternals;
    fixture.detectChanges();
    popover = fixture.debugElement.query(By.directive(Popover)).componentInstance as Popover;
  });

  function toolsItem(): MenuItem {
    const item = internals.menuItems().find((i) => i.icon === 'md md-auto_fix_high');
    if (!item?.command) {
      throw new Error('No se encontró el ítem Herramientas con command');
    }
    return item;
  }

  it('pasa el evento DOM (no el wrapper de PrimeNG) al popover', () => {
    const toggleSpy = vi.spyOn(popover, 'toggle').mockImplementation(() => undefined);
    const item = toolsItem();
    const domEvent = new MouseEvent('click', { bubbles: true });

    // PrimeNG invoca command con MenuItemCommandEvent, no con el evento DOM.
    item.command!({ originalEvent: domEvent, item });

    expect(toggleSpy).toHaveBeenCalledWith(domEvent);
  });

  it('no abre el popover si PrimeNG llama sin evento original', () => {
    const toggleSpy = vi.spyOn(popover, 'toggle').mockImplementation(() => undefined);

    toolsItem().command!({});

    expect(toggleSpy).not.toHaveBeenCalled();
  });
});
