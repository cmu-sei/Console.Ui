import { Injectable } from '@angular/core';
import { QueryEntity } from '@datorama/akita';
import { Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { Vm } from '../../generated/vm-api';
import { VmStore, VmState } from './vm.store';

@Injectable({ providedIn: 'root' })
export class VmQuery extends QueryEntity<VmState> {
  constructor(protected store: VmStore) {
    super(store);
  }

  public selectEntityNotNull(id: string): Observable<Vm> {
    return super.selectEntity(id).pipe(filter((vm) => vm != null));
  }
}
