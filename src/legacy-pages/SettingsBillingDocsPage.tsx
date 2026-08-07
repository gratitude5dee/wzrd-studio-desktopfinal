import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { appRoutes } from '@/lib/routes';

const SettingsBillingDocsPage = () => {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
        <Link to={appRoutes.settings.billing} className="mb-5 inline-flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200">
          <ArrowLeft className="h-4 w-4" />
          Back to Billing
        </Link>

        <h1 className="mb-2 text-3xl font-semibold">Billing Docs</h1>
        <p className="mb-8 text-sm text-zinc-400">
          Operational notes for billing mode, checkout behavior, and Stripe webhook reconciliation.
        </p>

        <div className="space-y-4">
          <Card className="border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="text-lg font-semibold">Billing Modes</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-300">
              <li>
                <code>disabled</code>: checkout and portal are unavailable; users remain in-app.
              </li>
              <li>
                <code>test_only</code>: Stripe test keys only. Live keys/events are rejected.
              </li>
              <li>
                <code>live</code>: Stripe live keys/events only.
              </li>
            </ul>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="text-lg font-semibold">Credit Grant Rules</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-300">
              <li>Top-up credits are granted by webhook on successful Stripe checkout.</li>
              <li>Webhook grants are idempotent via Stripe event id external reference.</li>
              <li>Generation credit enforcement always occurs server-side.</li>
            </ul>
          </Card>

          <Card className="border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="text-lg font-semibold">Operational Checklist</h2>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-300">
              <li>Configure <code>BILLING_MODE</code>, <code>STRIPE_SECRET_KEY</code>, and <code>STRIPE_WEBHOOK_SECRET</code>.</li>
              <li>Point Stripe webhook endpoint to <code>/functions/v1/billing-webhook</code>.</li>
              <li>Keep live mode off until test mode validation is complete.</li>
            </ul>
            <div className="mt-4">
              <a href="https://stripe.com/docs/webhooks" target="_blank" rel="noreferrer">
                <Button variant="outline" className="border-zinc-700 bg-zinc-950 text-zinc-100 hover:bg-zinc-800">
                  Stripe Webhooks Docs
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              </a>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default SettingsBillingDocsPage;
