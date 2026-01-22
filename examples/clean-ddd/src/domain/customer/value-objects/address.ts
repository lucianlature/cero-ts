/**
 * Address Value Object
 * Represents a shipping or billing address
 */
export interface AddressProps {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export class Address {
  readonly street: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly country: string;

  private constructor(props: AddressProps) {
    this.street = props.street;
    this.city = props.city;
    this.state = props.state;
    this.postalCode = props.postalCode;
    this.country = props.country;
    Object.freeze(this);
  }

  static create(props: AddressProps): Address {
    if (!props.street || props.street.trim().length === 0) {
      throw new InvalidAddressError('Street is required');
    }
    if (!props.city || props.city.trim().length === 0) {
      throw new InvalidAddressError('City is required');
    }
    if (!props.state || props.state.trim().length === 0) {
      throw new InvalidAddressError('State is required');
    }
    if (!props.postalCode || props.postalCode.trim().length === 0) {
      throw new InvalidAddressError('Postal code is required');
    }
    if (!props.country || props.country.trim().length === 0) {
      throw new InvalidAddressError('Country is required');
    }

    return new Address({
      street: props.street.trim(),
      city: props.city.trim(),
      state: props.state.trim().toUpperCase(),
      postalCode: props.postalCode.trim(),
      country: props.country.trim().toUpperCase(),
    });
  }

  equals(other: Address): boolean {
    return (
      this.street === other.street &&
      this.city === other.city &&
      this.state === other.state &&
      this.postalCode === other.postalCode &&
      this.country === other.country
    );
  }

  toJSON() {
    return {
      street: this.street,
      city: this.city,
      state: this.state,
      postalCode: this.postalCode,
      country: this.country,
    };
  }

  toString(): string {
    return `${this.street}, ${this.city}, ${this.state} ${this.postalCode}, ${this.country}`;
  }
}

export class InvalidAddressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAddressError';
  }
}
