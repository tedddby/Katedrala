export interface Customer {
  id: string;
  email: string;
  name: string;
  blocked: boolean;
}

export function displayName(customer: Customer): string {
  return customer.name.trim() !== "" ? customer.name : customer.email;
}
