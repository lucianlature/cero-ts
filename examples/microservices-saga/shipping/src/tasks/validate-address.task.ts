// ---------------------------------------------------------------------------
// ValidateAddressTask — Validates shipping address format
// ---------------------------------------------------------------------------
// cero-ts features: Task, required(), format validation, fail
// ---------------------------------------------------------------------------

import { Task, required } from 'cero-ts';
import type { ShippingAddress } from '@saga/shared';
import { createServiceLogger } from '@saga/shared';

const log = createServiceLogger('shipping');

export interface ValidateAddressContext extends Record<string, unknown> {
  orderId?: string;
  address?: ShippingAddress;
  addressValid?: boolean;
}

export class ValidateAddressTask extends Task<ValidateAddressContext> {
  static override attributes = {
    orderId: required({ type: 'string', presence: true }),
    address: required(),
  };

  declare orderId: string;
  declare address: ShippingAddress;

  override async work(): Promise<void> {
    const { street, city, state, postalCode, country } = this.address;

    if (!street || street.trim().length < 3) {
      this.fail('Invalid street address', { field: 'street' });
      return;
    }

    if (!city || city.trim().length < 2) {
      this.fail('Invalid city', { field: 'city' });
      return;
    }

    if (!state || state.trim().length < 2) {
      this.fail('Invalid state', { field: 'state' });
      return;
    }

    // US postal code validation
    if (country === 'US' && !/^\d{5}(-\d{4})?$/.test(postalCode)) {
      this.fail('Invalid US postal code format', {
        field: 'postalCode',
        expected: 'XXXXX or XXXXX-XXXX',
      });
      return;
    }

    if (!country || country.trim().length !== 2) {
      this.fail('Country must be a 2-letter ISO code', { field: 'country' });
      return;
    }

    this.context.orderId = this.orderId;
    this.context.address = this.address;
    this.context.addressValid = true;

    log.info('Address validated');
  }
}
