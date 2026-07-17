// Copyright 2021 Carnegie Mellon University. All Rights Reserved.
// Released under a MIT (SEI)-style license. See LICENSE.md in the project root for license information.

import { of } from 'rxjs';
import { OptionsBarComponent } from './options-bar.component';

describe('OptionsBarComponent network confirmation', () => {
  function createComponent(confirmation: boolean | undefined) {
    const changedModel = {
      networkCards: {
        availableNetworks: {},
        currentNetworks: {},
        readOnlyNetworks: [],
      },
    };
    const vsphereService = {
      model: {
        networkCards: {
          availableNetworks: {
            restricted: 'Restricted Network',
            allowed: 'Allowed Network',
          },
          currentNetworks: { adapter1: 'restricted' },
          readOnlyNetworks: ['restricted'],
        },
      },
      changeNic: jasmine
        .createSpy('changeNic')
        .and.returnValue(of(changedModel)),
    };
    const crucibleDialogService = {
      confirm: jasmine.createSpy('confirm').and.returnValue({
        afterClosed: () => of(confirmation),
      }),
    };
    const userPermissionsService = {
      can: jasmine.createSpy('can').and.returnValue(of(true)),
    };

    const component = new OptionsBarComponent(
      vsphereService as any,
      {} as any,
      {} as any,
      crucibleDialogService as any,
      {} as any,
      { snapshot: { queryParams: {} } } as any,
      {} as any,
      {} as any,
      {} as any,
      userPermissionsService as any,
      {} as any,
      { userTheme$: of(null) } as any,
    );
    component.vmId = 'vm-1';

    return { component, crucibleDialogService, vsphereService };
  }

  it('changes a restricted network only after explicit confirmation', () => {
    const { component, crucibleDialogService, vsphereService } =
      createComponent(true);

    component.changeNic('adapter1', 'allowed');

    expect(crucibleDialogService.confirm).toHaveBeenCalledWith({
      title: 'Confirm Network Change',
      message:
        'You are currently on "Restricted Network", which is not in your allowed network list. If you switch away, you will not be able to switch back. Do you want to continue?',
      confirmText: 'Confirm',
      cancelText: 'Cancel',
    });
    expect(vsphereService.changeNic).toHaveBeenCalledWith(
      'vm-1',
      'adapter1',
      'allowed',
    );
  });

  for (const confirmation of [false, undefined]) {
    it(`does not change a restricted network when confirmation is ${confirmation}`, () => {
      const { component, vsphereService } = createComponent(confirmation);

      component.changeNic('adapter1', 'allowed');

      expect(vsphereService.changeNic).not.toHaveBeenCalled();
    });
  }
});
