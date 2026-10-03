type Wallet = {
  __mock?: boolean;
  profile?: {
    get: (input: {
      fields: string[];
    }) => Promise<{ profile: Record<string, string> }>;
  };
  payment?: {
    charge: (input: Record<string, unknown>) => Promise<{ receiptId: string }>;
    status: (input: {
      receiptId: string;
    }) => Promise<{ status: string; receiptId: string; authToken: string }>;
  };
};
type LottiePlayer = { destroy: () => void };
declare global {
  interface Window {
    wallet?: Wallet;
    lottie?: {
      loadAnimation: (options: {
        container: HTMLElement;
        renderer: "svg";
        loop: boolean;
        autoplay: boolean;
        animationData: object;
      }) => LottiePlayer;
    };
  }
}
const mock =
  (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === "true") &&
  new URLSearchParams(location.search).get("mock") === "1";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const mockProfile: Record<string, string> = {
  display_name: "Aishath",
  mobile_masked: "+960 *** 4455",
  preferred_name: "Aisha",
  email: "aisha@example.mv",
  mobile: "+960 900 4455",
  vpa_id: "aisha@swipe",
  full_name: "Aishath Mohamed",
  gender: "female",
  nationality: "Maldivian",
  date_of_birth: "1994-07-14",
  country: "MV",
  employment_status: "employed",
  employment_sector: "technology",
  occupation: "Product designer",
  employer_name: "Example Maldives",
  monthly_income_range: "MVR 20,000–29,999",
  has_bml_account: "true",
  profile_complete: "true",
  document_type: "national_id",
  document_number: "A000000",
  document_expiry_date: "2030-01-01",
  document_verification_status: "verified",
};
function mockWallet(): Wallet {
  return {
    __mock: true,
    profile: {
      async get({ fields }) {
        await wait(250);
        return {
          profile: Object.fromEntries(
            fields.map((field) => [field, mockProfile[field] || "mock-value"]),
          ),
        };
      },
    },
    payment: {
      async charge() {
        await wait(500);
        return { receiptId: `rcpt_mock_${crypto.randomUUID()}` };
      },
      async status({ receiptId }) {
        await wait(450);
        return {
          status: "completed",
          receiptId,
          authToken: `mock.receipt.${crypto.randomUUID()}`,
        };
      },
    },
  };
}
export const wallet = window.wallet || (mock ? mockWallet() : undefined);
