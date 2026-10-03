import { useEffect, useMemo, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  FlaskConical,
  LogIn,
  LogOut,
  Minus,
  PackageCheck,
  Plus,
  ShoppingBag,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { resetDemoSession } from "./lib/api";
import {
  api,
  type CartItem,
  type Delivery,
  type Order,
  type Product,
} from "./lib/api";
import { wallet } from "./lib/wallet";

const money = (laari: number) =>
  new Intl.NumberFormat("en-MV", { style: "currency", currency: "MVR" }).format(
    laari / 100,
  );
const deliverySchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(80),
  mobile: z
    .string()
    .transform((value) => value.replace(/\s+/g, ""))
    .pipe(
      z
        .string()
        .regex(
          /^(?:\+?960)?[79]\d{6}$/,
          "Enter a valid Maldives mobile number",
        ),
    ),
  address: z.string().trim().min(1, "Enter your delivery address").max(500),
  island: z.string().trim().min(2, "Enter your island or city").max(80),
  notes: z.string().max(240),
});
type View = "shop" | "cart" | "orders" | "thanks" | "debug";
const inputClass =
  "min-h-12 w-full min-w-0 rounded-xl border border-neutral-950/10 bg-white px-3 text-base outline-none placeholder:text-neutral-400 focus:border-violet-600 focus:outline-2 focus:outline-violet-600 focus:-outline-offset-1 sm:text-sm";

export default function App() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("shop");
  const [selected, setSelected] = useState<Product | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [size, setSize] = useState("M");
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = z
        .array(
          z.object({
            productId: z.enum(["swipe-tee", "swipe-cap", "swipe-mug"]),
            variant: z.enum(["S", "M", "L", "XL", "ONE"]),
            quantity: z.number().int().min(1).max(9),
          }),
        )
        .max(12)
        .safeParse(JSON.parse(localStorage.getItem("swipe-cart") || "[]"));
      return saved.success ? saved.data : [];
    } catch {
      return [];
    }
  });
  const [checkout, setCheckout] = useState(false);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [successAnimation, setSuccessAnimation] = useState<object | null>(null);
  const [form, setForm] = useState<Delivery>({
    name: "",
    mobile: "",
    address: "",
    island: "",
    notes: "",
  });
  const [formError, setFormError] = useState("");
  const [profileName, setProfileName] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const products = useQuery({ queryKey: ["products"], queryFn: api.products });
  const orders = useQuery({
    queryKey: ["orders"],
    queryFn: api.orders,
    enabled: view === "orders",
  });
  useEffect(() => {
    try {
      localStorage.setItem("swipe-cart", JSON.stringify(cart));
    } catch {
      /* Swipe disables WebView DOM storage; the cart remains safely in memory. */
    }
  }, [cart]);
  useEffect(() => {
    fetch("./assets/success.json")
      .then((r) => r.json() as Promise<object>)
      .then(setSuccessAnimation)
      .catch(() => {});
  }, []);
  const enriched = useMemo(
    () =>
      cart
        .map((i) => ({
          ...i,
          product: products.data?.find((p) => p.id === i.productId),
        }))
        .filter((i) => i.product),
    [cart, products.data],
  );
  const count = cart.reduce((n, i) => n + i.quantity, 0);
  const total = enriched.reduce(
    (n, i) => n + (i.product?.priceLaari || 0) * i.quantity,
    0,
  );
  const add = (product: Product) => {
    setCart((old) => {
      const variant = product.hasSizes ? size : "ONE",
        found = old.find(
          (i) => i.productId === product.id && i.variant === variant,
        );
      return found
        ? old.map((i) =>
            i === found ? { ...i, quantity: Math.min(9, i.quantity + 1) } : i,
          )
        : [...old, { productId: product.id, variant, quantity: 1 }];
    });
    setSelected(null);
    setView("cart");
  };
  const update = (index: number, delta: number) =>
    setCart((old) =>
      old.flatMap((item, i) =>
        i === index
          ? item.quantity + delta > 0
            ? [{ ...item, quantity: Math.min(9, item.quantity + delta) }]
            : []
          : [item],
      ),
    );
  const paymentAttempt = useRef<{
    order?: Order;
    receiptId?: string;
    key?: string;
  }>({});
  const purchase = useMutation({
    mutationFn: async () => {
      const parsed = deliverySchema.safeParse(form);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues[0]?.message || "Check delivery details",
        );
      if (!wallet?.payment)
        throw new Error("Open this mini app inside Swipe to pay.");
      const key = JSON.stringify({ cart, delivery: parsed.data });
      if (paymentAttempt.current.key && paymentAttempt.current.key !== key)
        throw new Error(
          "Finish the previous payment before changing your order.",
        );
      paymentAttempt.current.key = key;
      const order =
        paymentAttempt.current.order ||
        (await api.createOrder(cart, parsed.data));
      paymentAttempt.current.order = order;
      const charge = paymentAttempt.current.receiptId
        ? { receiptId: paymentAttempt.current.receiptId }
        : await wallet.payment.charge({
            amount: order.amount,
            currencyCode: order.currency,
            merchantPaymentRef: order.merchantPaymentRef,
            merchantShortCode: order.merchantShortCode,
            idempotencyKey: order.idempotencyKey,
          });
      paymentAttempt.current.receiptId = charge.receiptId;
      const proof = await wallet.payment.status({
        receiptId: charge.receiptId,
      });
      if (proof.status !== "completed")
        throw new Error("Payment is not complete yet.");
      return api.fulfill(order.orderId, proof.receiptId, proof.authToken);
    },
    onSuccess: (order) => {
      setLastOrder(order);
      paymentAttempt.current = {};
      setCart([]);
      setCheckout(false);
      setView("thanks");
      void qc.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e) => setFormError(e.message),
  });
  const authorize = async () => {
    setFormError("");
    setLoginBusy(true);
    try {
      if (!wallet?.profile)
        throw new Error("Open this mini app inside Swipe to log in.");
      const result = await wallet.profile.get({
        fields: ["full_name", "mobile"],
      });
      const name = result.profile.full_name || "Swipe user";
      const mobile = (result.profile.mobile || "").replace(/\s+/g, "");
      setForm((v) => ({ ...v, name, mobile }));
      setProfileName(name);
    } catch (e) {
      setFormError(
        e instanceof Error ? e.message : "Could not log in with Swipe",
      );
    } finally {
      setLoginBusy(false);
    }
  };
  const logout = () => {
    setProfileName("");
    resetDemoSession();
    qc.removeQueries({ queryKey: ["orders"] });
    setSelectedOrder(null);
    setLastOrder(null);
    setCart([]);
    paymentAttempt.current = {};
    setView("shop");
    setForm({ name: "", mobile: "", address: "", island: "", notes: "" });
    setFormError("");
  };
  return (
    <div className="mx-auto min-h-dvh max-w-5xl bg-brand-50 pb-28">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-violet-100/80 bg-brand-50/90 px-4 backdrop-blur-xl md:h-18 md:px-10">
        <button
          onClick={() => setView("shop")}
          className="flex items-center gap-2"
          aria-label="Swipe MiniApp Demo home"
        >
          <img
            src="./assets/swipe-app-icon.webp"
            className="size-8 rounded-xl md:size-9"
            alt=""
          />
          <span className="text-sm font-black tracking-tight sm:text-base md:text-lg">
            Swipe{" "}
            <span className="font-medium text-neutral-500">MiniApp Demo</span>
          </span>
        </button>
        {profileName ? (
          <button
            type="button"
            onClick={logout}
            disabled={
              purchase.isPending || loginBusy || !!paymentAttempt.current.order
            }
            className="flex items-center gap-1.5 rounded-full bg-violet-100 px-3 py-2 text-xs font-semibold text-violet-800"
          >
            <LogOut className="size-3.5" />
            Logout
          </button>
        ) : (
          <button
            type="button"
            onClick={authorize}
            disabled={loginBusy || purchase.isPending}
            className="rounded-full bg-violet-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
          >
            {loginBusy ? "Connecting…" : "Login with Swipe"}
          </button>
        )}
      </header>
      {formError && !checkout && (
        <p
          role="alert"
          className="mx-4 mt-3 rounded-2xl bg-red-50 p-3 text-sm text-red-700"
        >
          {formError}
        </p>
      )}
      {(products.isError || (view === "orders" && orders.isError)) && (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-2xl bg-red-50 p-3 text-sm text-red-700"
        >
          Could not load {view === "orders" ? "orders" : "products"}.{" "}
          <button
            onClick={() =>
              view === "orders" ? orders.refetch() : products.refetch()
            }
            className="underline"
          >
            Retry
          </button>
        </div>
      )}
      <main key={view} className="page-enter">
        {view === "shop" && (
          <Shop
            products={products.data || []}
            loading={products.isLoading}
            onSelect={(p) => {
              setSize("M");
              setSelected(p);
            }}
          />
        )}
        {view === "cart" && (
          <Cart
            items={enriched}
            total={total}
            update={update}
            remove={(i) => setCart((c) => c.filter((_, x) => x !== i))}
            checkout={() => setCheckout(true)}
            back={() => setView("shop")}
          />
        )}{" "}
        {view === "orders" && (
          <Orders
            orders={orders.data || []}
            loading={orders.isLoading}
            onSelect={setSelectedOrder}
          />
        )}{" "}
        {view === "thanks" && (
          <Thanks
            order={lastOrder}
            animation={successAnimation}
            onOrders={() => setView("orders")}
            onShop={() => setView("shop")}
          />
        )}{" "}
        {view === "debug" && <DebugPage />}
      </main>
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-5xl justify-around border-t border-violet-100 bg-white/95 px-1 pt-1.5 backdrop-blur-xl">
        {(
          [
            ["shop", Store, "Shop"],
            ["cart", ShoppingBag, "Cart"],
            ["orders", PackageCheck, "Orders"],
            ["debug", FlaskConical, "Debug"],
          ] as const
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`relative flex min-w-16 flex-col items-center gap-1 rounded-2xl py-2 text-[11px] font-bold ${view === id ? "text-violet-700" : "text-neutral-500"}`}
          >
            <Icon className="size-5" />
            {label}
            {id === "cart" && count > 0 && (
              <span className="absolute right-1 top-0 grid size-5 place-items-center rounded-full bg-violet-700 text-[10px] text-white">
                {count}
              </span>
            )}
          </button>
        ))}
      </nav>
      <ProductDialog
        product={selected}
        size={size}
        setSize={setSize}
        close={() => setSelected(null)}
        add={add}
      />
      <Checkout
        open={checkout}
        close={() => {
          if (!purchase.isPending) setCheckout(false);
        }}
        items={enriched}
        total={total}
        form={form}
        setForm={setForm}
        loggedIn={!!profileName}
        loginBusy={loginBusy}
        onLogin={authorize}
        submit={() => {
          setFormError("");
          purchase.mutate();
        }}
        error={formError}
        busy={purchase.isPending}
      />
      <OrderDetails
        order={selectedOrder}
        products={products.data || []}
        close={() => setSelectedOrder(null)}
      />
    </div>
  );
}

function Shop({
  products,
  loading,
  onSelect,
}: {
  products: Product[];
  loading: boolean;
  onSelect: (p: Product) => void;
}) {
  return (
    <>
      <section className="hero-arc relative z-10 flex min-h-[19rem] flex-col justify-center overflow-hidden bg-violet-700 px-5 pb-14 pt-10 text-white shadow-[0_12px_28px_rgba(74,48,168,.12)] md:min-h-0 md:block md:rounded-b-[3rem] md:px-10 md:py-20">
        <div
          className="pointer-events-none absolute -bottom-28 right-4 size-56 rounded-full bg-violet-500/20 blur-2xl"
          aria-hidden="true"
        />
        <p className="relative mb-3 text-[11px] font-black uppercase tracking-[.22em] text-violet-200">
          Swipe merchant edition
        </p>
        <h1 className="relative max-w-3xl text-[2.2rem] font-black leading-[1.05] tracking-[-.04em] md:text-7xl">
          Good gear for people building good businesses.
        </h1>
        <p className="relative mt-4 max-w-xl text-sm leading-6 text-violet-100 md:text-lg">
          Small-batch essentials for merchant teams across the Maldives.
        </p>
      </section>
      <section className="relative px-4 pb-7 pt-8 md:px-10 md:py-10">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[.2em] text-violet-700">
              The first drop
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">
              Made to be used.
            </h2>
          </div>
          <span className="text-xs text-neutral-500">3 pieces</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3 md:gap-5">
          {loading
            ? [1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-96 animate-pulse rounded-3xl bg-violet-100"
                />
              ))
            : products.map((p, i) => (
                <button
                  style={{ animationDelay: `${i * 70}ms` }}
                  key={p.id}
                  onClick={() => onSelect(p)}
                  className="product-enter group overflow-hidden rounded-3xl bg-white text-left shadow-[0_10px_35px_rgba(51,35,91,.07)] ring-1 ring-violet-100 transition hover:-translate-y-1"
                >
                  <div
                    className={`aspect-square overflow-hidden ${i === 1 ? "bg-[#edddff]" : "bg-[#e8e0f8]"}`}
                  >
                    <img
                      src={p.image}
                      alt={p.name}
                      className="size-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-black">{p.name}</h3>
                      <strong className="whitespace-nowrap text-violet-700">
                        {money(p.priceLaari)}
                      </strong>
                    </div>
                    <p className="mt-1 text-sm leading-5 text-neutral-500">
                      {p.shortDescription}
                    </p>
                  </div>
                </button>
              ))}
        </div>
      </section>
    </>
  );
}

function ProductDialog({
  product,
  size,
  setSize,
  close,
  add,
}: {
  product: Product | null;
  size: string;
  setSize: (s: string) => void;
  close: () => void;
  add: (p: Product) => void;
}) {
  return (
    <Dialog.Root open={!!product} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-neutral-950/50 backdrop-blur-sm" />
        <Dialog.Content className="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92dvh] max-w-xl overflow-auto rounded-t-[2rem] bg-white p-5 shadow-2xl md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:rounded-[2rem]">
          <Dialog.Close
            aria-label="Close dialog"
            className="absolute right-5 top-5 z-10 grid size-11 place-items-center rounded-full bg-white/90"
          >
            <X />
          </Dialog.Close>
          {product && (
            <>
              <img
                src={product.image}
                alt=""
                className="aspect-[4/3] w-full rounded-3xl bg-violet-100 object-cover"
              />
              <Dialog.Title className="mt-6 text-2xl font-black">
                {product.name}
              </Dialog.Title>
              <Dialog.Description className="mt-2 leading-7 text-neutral-500">
                {product.description}
              </Dialog.Description>
              {product.hasSizes && (
                <div className="mt-6">
                  <p className="mb-3 text-sm font-bold">Choose a size</p>
                  <div className="flex gap-2">
                    {["S", "M", "L", "XL"].map((s) => (
                      <button
                        key={s}
                        onClick={() => setSize(s)}
                        className={`size-12 rounded-2xl border font-bold ${s === size ? "border-violet-700 bg-violet-700 text-white" : "border-neutral-200"}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-7 flex items-center justify-between gap-4">
                <strong className="text-xl">{money(product.priceLaari)}</strong>
                <Button onClick={() => add(product)} className="flex-1">
                  Add to cart
                </Button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Cart({
  items,
  total,
  update,
  remove,
  checkout,
  back,
}: {
  items: Array<CartItem & { product?: Product }>;
  total: number;
  update: (i: number, d: number) => void;
  remove: (i: number) => void;
  checkout: () => void;
  back: () => void;
}) {
  return (
    <section className="px-4 py-6 md:px-10 md:py-8">
      <button
        onClick={back}
        className="mb-5 flex items-center gap-2 text-sm font-bold text-neutral-600"
      >
        <ArrowLeft className="size-4" />
        Continue shopping
      </button>
      <h1 className="text-3xl font-black tracking-tight md:text-4xl">
        Your cart
      </h1>
      <p className="mt-1 text-sm text-neutral-500">
        Review your items before checkout.
      </p>
      {!items.length ? (
        <div className="relative mt-6 overflow-hidden rounded-[2rem] bg-violet-700 px-5 pb-6 pt-8 text-center text-white shadow-[0_20px_50px_rgba(74,48,168,.18)]">
          <div className="pointer-events-none absolute -left-16 -top-20 size-48 rounded-full bg-violet-500/35 blur-2xl" />
          <div
            className="relative mx-auto flex h-36 max-w-64 items-end justify-center"
            aria-hidden="true"
          >
            <img
              src="./assets/swipe-tee.webp"
              alt=""
              className="absolute left-4 top-5 size-24 -rotate-6 rounded-3xl object-cover shadow-xl ring-4 ring-violet-600"
            />
            <img
              src="./assets/swipe-cap.webp"
              alt=""
              className="absolute right-4 top-5 size-24 rotate-6 rounded-3xl object-cover shadow-xl ring-4 ring-violet-600"
            />
            <div className="absolute left-1/2 top-0 grid size-20 -translate-x-1/2 place-items-center rounded-full bg-white shadow-xl">
              <ShoppingBag className="size-8 text-violet-700" />
            </div>
          </div>
          <div className="relative">
            <p className="text-[11px] font-semibold uppercase tracking-[.2em] text-violet-200">
              Ready when you are
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Your next favourite is waiting.
            </h2>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-violet-100">
              Explore the first Swipe drop and add something made for everyday
              use.
            </p>
            <Button
              onClick={back}
              className="mt-5 w-full bg-white text-violet-800 shadow-none hover:bg-violet-50"
            >
              Browse the collection
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-6 space-y-3">
            {items.map((item, i) => (
              <article
                key={`${item.productId}-${item.variant}`}
                className="flex gap-4 rounded-3xl bg-white p-3 ring-1 ring-violet-100"
              >
                <img
                  src={item.product?.image}
                  className="size-24 rounded-2xl bg-violet-100 object-cover"
                  alt=""
                />
                <div className="min-w-0 flex-1 py-1">
                  <h2 className="truncate font-black">{item.product?.name}</h2>
                  <p className="mt-1 text-sm text-neutral-500">
                    {item.variant !== "ONE" && `Size ${item.variant} · `}
                    {money(item.product?.priceLaari || 0)}
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center rounded-full bg-brand-50">
                      <button
                        aria-label="Decrease"
                        className="grid size-11 place-items-center"
                        onClick={() => update(i, -1)}
                      >
                        <Minus className="size-4" />
                      </button>
                      <span className="w-7 text-center text-sm font-bold">
                        {item.quantity}
                      </span>
                      <button
                        aria-label="Increase"
                        disabled={item.quantity >= 9}
                        className="grid size-11 place-items-center"
                        onClick={() => update(i, 1)}
                      >
                        <Plus className="size-4" />
                      </button>
                    </div>
                    <button
                      onClick={() => remove(i)}
                      aria-label="Remove item"
                      className="grid size-10 place-items-center text-neutral-400"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-6 rounded-3xl bg-neutral-950 p-6 text-white">
            <div className="flex justify-between">
              <span className="text-neutral-400">Total</span>
              <strong className="text-2xl">{money(total)}</strong>
            </div>
            <Button
              onClick={checkout}
              className="mt-6 w-full bg-white text-neutral-950 hover:bg-violet-100"
            >
              Secure checkout
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

type Enriched = Array<CartItem & { product?: Product }>;
function Checkout({
  open,
  close,
  items,
  total,
  form,
  setForm,
  loggedIn,
  loginBusy,
  onLogin,
  submit,
  error,
  busy,
}: {
  open: boolean;
  close: () => void;
  items: Enriched;
  total: number;
  form: Delivery;
  setForm: (d: Delivery) => void;
  loggedIn: boolean;
  loginBusy: boolean;
  onLogin: () => void;
  submit: () => void;
  error: string;
  busy: boolean;
}) {
  const [otherIsland, setOtherIsland] = useState(false);
  const islands = ["Malé", "Hulhumalé", "Villingili"];
  const customIsland =
    otherIsland || (!!form.island && !islands.includes(form.island));
  const itemCount = items.reduce((n, i) => n + i.quantity, 0);
  const field =
    (key: keyof Delivery) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setForm({
        ...form,
        [key]:
          key === "mobile"
            ? e.target.value.replace(/\s+/g, "")
            : e.target.value,
      });
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-neutral-950/50 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[94dvh] max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl ring-1 ring-neutral-950/5 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl">
          <header className="shrink-0 border-b border-neutral-950/5 px-5 pb-4 pt-5 sm:px-6">
            <Dialog.Close
              type="button"
              disabled={busy}
              aria-label="Close checkout"
              className="absolute right-3 top-3 grid size-12 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100 focus-visible:outline-2 focus-visible:outline-violet-600"
            >
              <X className="size-5" />
            </Dialog.Close>
            <p className="text-base font-medium text-violet-700 sm:text-sm">
              {loggedIn ? "Swipe checkout" : "Guest checkout"}
            </p>
            <Dialog.Title className="mt-1 pr-10 text-balance text-2xl font-semibold tracking-tight">
              Make it yours
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-pretty text-base text-neutral-500 sm:text-sm">
              Your delivery details. Payment stays in Swipe.
            </Dialog.Description>
          </header>
          <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
            {!loggedIn && (
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-violet-50 p-3">
                <div className="min-w-0 text-base sm:text-sm">
                  <p className="font-medium text-neutral-900">
                    Skip the typing
                  </p>
                  <p className="text-neutral-500">
                    Prefill with your Swipe profile.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onLogin}
                  disabled={loginBusy}
                  className="min-h-12 shrink-0 rounded-lg bg-white px-3 text-base font-medium text-violet-700 ring-1 ring-violet-950/10 hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:opacity-60 sm:text-sm"
                >
                  {loginBusy ? "Connecting…" : "Login with Swipe"}
                </button>
              </div>
            )}
            <h3 className="mb-3 text-base font-medium">Delivery details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                name="name"
                className={inputClass}
                value={form.name}
                onChange={field("name")}
                aria-label="Full name"
                placeholder="Full name"
                autoComplete="name"
              />
              <input
                name="mobile"
                className={inputClass}
                value={form.mobile}
                onChange={field("mobile")}
                aria-label="Mobile number"
                placeholder="Mobile number"
                inputMode="tel"
                autoComplete="tel"
              />
              <div className="grid grid-cols-[1fr_2rem] sm:col-span-2">
                <select
                  name="island"
                  aria-label="Island or city"
                  className={`${inputClass} col-span-full row-start-1 appearance-none pr-8`}
                  value={customIsland ? "other" : form.island}
                  onChange={(e) => {
                    const other = e.target.value === "other";
                    setOtherIsland(other);
                    setForm({ ...form, island: other ? "" : e.target.value });
                  }}
                >
                  <option value="" disabled>
                    Select island or city
                  </option>
                  {islands.map((island) => (
                    <option key={island} value={island}>
                      {island}
                    </option>
                  ))}
                  <option value="other">Other island or city</option>
                </select>
                <ChevronDown
                  aria-hidden="true"
                  className="pointer-events-none col-start-2 row-start-1 size-4 place-self-center stroke-neutral-500"
                />
              </div>
              {customIsland && (
                <input
                  name="otherIsland"
                  className={`${inputClass} sm:col-span-2`}
                  value={form.island}
                  onChange={field("island")}
                  aria-label="Other island or city"
                  placeholder="Enter your island or city"
                  autoComplete="address-level2"
                  maxLength={80}
                />
              )}
              <textarea
                name="address"
                maxLength={500}
                rows={2}
                className={`${inputClass} resize-y py-3 sm:col-span-2`}
                value={form.address}
                onChange={field("address")}
                aria-label="House, street, floor, landmark and delivery details"
                placeholder="House / building, street and floor"
                autoComplete="street-address"
              />
              <input
                name="notes"
                maxLength={240}
                className={`${inputClass} sm:col-span-2`}
                value={form.notes}
                onChange={field("notes")}
                aria-label="Delivery note (optional)"
                placeholder="Delivery note (optional)"
              />
            </div>
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700"
              >
                {error}
              </p>
            )}
          </div>
          <footer className="safe-bottom shrink-0 border-t border-neutral-950/5 bg-white px-5 py-4 sm:px-6">
            <div className="mb-3 flex items-center justify-between gap-3 text-base tabular-nums sm:text-sm">
              <p className="text-neutral-500">
                {itemCount} {itemCount === 1 ? "item" : "items"} · Total
              </p>
              <p className="text-xl font-semibold tracking-tight">
                {money(total)}
              </p>
            </div>
            <Button
              type="button"
              className="w-full rounded-xl font-medium shadow-none"
              disabled={busy || loginBusy}
              onClick={submit}
            >
              {busy ? "Confirming…" : "Continue to Swipe"}
            </Button>
            <p className="mt-2 text-center text-base text-neutral-500 sm:text-sm">
              Review and approve the payment in Swipe.
            </p>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Orders({
  orders,
  loading,
  onSelect,
}: {
  orders: Order[];
  loading: boolean;
  onSelect: (order: Order) => void;
}) {
  return (
    <section className="px-4 py-7 md:px-10 md:py-10">
      <p className="text-xs font-black uppercase tracking-[.2em] text-violet-700">
        Order history
      </p>
      <h1 className="mt-1 text-3xl font-black md:text-4xl">My orders</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Tap an order to see its details.
      </p>
      <div className="mt-5 space-y-2">
        {loading ? (
          <p>Loading…</p>
        ) : !orders.length ? (
          <p className="rounded-3xl bg-white p-8 text-center text-neutral-500">
            No orders yet.
          </p>
        ) : (
          orders.map((o) => (
            <button
              key={o.orderId}
              onClick={() => onSelect(o)}
              className="w-full rounded-3xl bg-white p-4 text-left ring-1 ring-violet-100 transition active:scale-[.99]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate font-black">{o.productName}</p>
                  <p className="mt-1 text-sm text-neutral-500">
                    {new Date(o.createdAt).toLocaleDateString()} ·{" "}
                    {o.deliveryIsland}
                  </p>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold capitalize text-emerald-700">
                  {o.status}
                </span>
              </div>
              <div className="mt-4 flex justify-between border-t border-neutral-100 pt-3 text-sm">
                <span>{o.itemCount} items</span>
                <strong>{money(o.amountLaari)}</strong>
              </div>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

function OrderDetails({
  order,
  products,
  close,
}: {
  order: Order | null;
  products: Product[];
  close: () => void;
}) {
  return (
    <Dialog.Root open={!!order} onOpenChange={(o) => !o && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay fixed inset-0 z-40 bg-neutral-950/50 backdrop-blur-sm" />
        <Dialog.Content className="dialog-sheet safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[92dvh] max-w-xl overflow-y-auto rounded-t-3xl bg-brand-50 px-4 pb-2 pt-5 md:bottom-auto md:top-1/2 md:-translate-y-1/2 md:rounded-[2rem] md:p-6">
          <Dialog.Close className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white">
            <X className="size-5" />
          </Dialog.Close>
          {order && (
            <>
              <p className="text-xs font-black uppercase tracking-[.2em] text-violet-700">
                Order details
              </p>
              <Dialog.Title className="mt-1 pr-12 text-2xl font-black">
                {order.productName}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-neutral-500">
                Placed {new Date(order.createdAt).toLocaleString()}
              </Dialog.Description>
              <div className="mt-4 space-y-2">
                {order.items.map((item, index) => {
                  const product = products.find((p) => p.id === item.productId);
                  return (
                    <div
                      key={`${item.productId}-${item.variant}-${index}`}
                      className="flex items-center gap-3 rounded-2xl bg-white p-2.5 ring-1 ring-violet-100"
                    >
                      <img
                        src={product?.image || "./assets/swipe-app-icon.webp"}
                        alt=""
                        className="size-16 shrink-0 rounded-xl bg-violet-100 object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">
                          {item.productName}
                        </p>
                        <p className="mt-1 text-xs text-neutral-500">
                          {item.variant !== "ONE"
                            ? `Size ${item.variant} · `
                            : ""}
                          Qty {item.quantity}
                        </p>
                      </div>
                      <strong className="text-sm">
                        {money(item.lineTotalLaari)}
                      </strong>
                    </div>
                  );
                })}
              </div>
              <dl className="mt-3 rounded-2xl bg-white p-4 text-sm ring-1 ring-violet-100">
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Delivery area</dt>
                  <dd className="font-semibold">{order.deliveryIsland}</dd>
                </div>
                <div className="mt-3 flex justify-between">
                  <dt className="text-neutral-500">Status</dt>
                  <dd className="font-semibold capitalize text-emerald-700">
                    {order.status}
                  </dd>
                </div>
                <div className="mt-3 flex justify-between">
                  <dt className="text-neutral-500">Order ID</dt>
                  <dd className="font-mono text-xs">
                    …{order.orderId.slice(-10)}
                  </dd>
                </div>
                {order.receiptId && (
                  <div className="mt-3 flex justify-between gap-4">
                    <dt className="text-neutral-500">Receipt</dt>
                    <dd className="truncate font-mono text-xs">
                      …{order.receiptId.slice(-10)}
                    </dd>
                  </div>
                )}
                <div className="mt-4 flex justify-between border-t border-neutral-100 pt-4 text-base">
                  <dt>Total</dt>
                  <dd className="font-bold">{money(order.amountLaari)}</dd>
                </div>
              </dl>
              <Button className="mt-3 w-full" onClick={close}>
                Done
              </Button>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const debugGroups = [
  {
    name: "Basic identity",
    fields: ["display_name", "mobile_masked", "preferred_name"],
  },
  { name: "Contact", fields: ["email", "mobile", "vpa_id"] },
  {
    name: "Personal",
    fields: ["full_name", "gender", "nationality", "date_of_birth", "country"],
  },
  {
    name: "Employment",
    fields: [
      "employment_status",
      "employment_sector",
      "occupation",
      "employer_name",
      "monthly_income_range",
    ],
  },
  { name: "Account", fields: ["has_bml_account", "profile_complete"] },
  {
    name: "Verified document",
    fields: [
      "document_type",
      "document_number",
      "document_expiry_date",
      "document_verification_status",
    ],
  },
];
function DebugPage() {
  const [output, setOutput] = useState(
    "Select a profile group to test the host bridge.",
  );
  const [busy, setBusy] = useState("");
  const run = async (name: string, fields: string[]) => {
    setBusy(name);
    try {
      if (!wallet?.profile)
        throw new Error(
          "wallet.profile.get is unavailable outside Swipe. Add ?mock=1 for browser testing.",
        );
      const result = await wallet.profile.get({ fields });
      setOutput(JSON.stringify({ profile: result.profile }, null, 2));
    } catch (error) {
      setOutput(error instanceof Error ? error.message : "Capability failed");
    } finally {
      setBusy("");
    }
  };
  return (
    <section className="px-4 py-7 md:px-10">
      <p className="text-[11px] font-black uppercase tracking-[.2em] text-violet-700">
        Developer reference
      </p>
      <h1 className="mt-1 text-3xl font-black">Bridge debugger</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-neutral-500">
        Test consented profile groups without mixing developer controls into the
        shopping flow.
      </p>
      <div className="mt-5 grid gap-2 md:grid-cols-2">
        {debugGroups.map((group) => (
          <button
            key={group.name}
            disabled={!!busy}
            onClick={() => run(group.name, group.fields)}
            className="rounded-2xl bg-white p-4 text-left ring-1 ring-violet-100 transition active:scale-[.99]"
          >
            <div className="flex items-center justify-between">
              <strong>{group.name}</strong>
              <span className="text-xs text-violet-700">
                {busy === group.name ? "Requesting…" : "Test"}
              </span>
            </div>
            <p className="mt-2 text-xs leading-5 text-neutral-500">
              {group.fields.join(" · ")}
            </p>
          </button>
        ))}
      </div>
      <div className="mt-4 overflow-hidden rounded-2xl bg-neutral-950 text-white">
        <div className="border-b border-white/10 px-4 py-3 text-xs font-semibold text-violet-200">
          Latest result
        </div>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words p-4 text-xs leading-5 text-neutral-300">
          {output}
        </pre>
      </div>
      <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-900">
        <strong>Payment reference</strong>
        <p className="mt-1">
          Checkout demonstrates <code>wallet.payment.charge</code> and{" "}
          <code>wallet.payment.status</code>. The host owns confirmation, wallet
          selection, and scope enforcement.
        </p>
      </div>
    </section>
  );
}
function Thanks({
  order,
  animation,
  onOrders,
  onShop,
}: {
  order: Order | null;
  animation: object | null;
  onOrders: () => void;
  onShop: () => void;
}) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (
      !animation ||
      !target.current ||
      !window.lottie ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const player = window.lottie.loadAnimation({
      container: target.current,
      renderer: "svg",
      loop: false,
      autoplay: true,
      animationData: animation,
    });
    return () => player.destroy();
  }, [animation]);
  return (
    <section className="mx-auto flex min-h-[70dvh] max-w-xl flex-col items-center justify-center px-4 py-6 text-center">
      <div className="success-mark" aria-hidden="true">
        <Check className="size-10" />
        <div ref={target} className="absolute inset-0" />
      </div>
      <p className="mt-3 text-xs font-black uppercase tracking-[.2em] text-violet-700">
        Order confirmed
      </p>
      <h1 className="mt-2 text-3xl font-black tracking-tight">
        Thanks. It’s on the way.
      </h1>
      <p className="mt-3 leading-6 text-neutral-500">
        Your payment is confirmed and your items are ready for delivery.
      </p>
      {order && (
        <div className="mt-6 w-full rounded-3xl bg-white p-4 text-left ring-1 ring-violet-100">
          <div className="flex justify-between">
            <span className="text-neutral-500">Order</span>
            <strong>{order.orderId.slice(-8).toUpperCase()}</strong>
          </div>
          <div className="mt-3 flex justify-between">
            <span className="text-neutral-500">Total</span>
            <strong>{money(order.amountLaari)}</strong>
          </div>
        </div>
      )}
      <Button onClick={onOrders} className="mt-6 w-full">
        View my orders
      </Button>
      <Button onClick={onShop} variant="ghost" className="mt-1 w-full">
        Continue shopping
      </Button>
    </section>
  );
}
