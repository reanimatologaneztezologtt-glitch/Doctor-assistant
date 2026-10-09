// paypal adapter: stub. Implement with the provider's hosted checkout and
// server-side webhook signature verification before enabling payments.
import { createStubProvider } from './_stub.mjs';

export default createStubProvider('paypal');
