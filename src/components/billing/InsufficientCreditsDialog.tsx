import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { appRoutes } from '@/lib/routes';

interface InsufficientCreditsDetail {
  required?: number;
  available?: number;
  topUpUrl?: string;
}

const EVENT_NAME = 'billing:insufficient-credits';

/**
 * Global, app-mounted dialog. Listens for `billing:insufficient-credits`
 * window events dispatched by `routeToBillingTopUp()`. Lets the user buy a
 * credit pack or upgrade to Pro without losing their current page state.
 */
export const InsufficientCreditsDialog = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<InsufficientCreditsDetail>({});

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<InsufficientCreditsDetail>;
      setDetail(custom.detail ?? {});
      setOpen(true);
    };
    window.addEventListener(EVENT_NAME, handler as EventListener);
    return () => window.removeEventListener(EVENT_NAME, handler as EventListener);
  }, []);

  const required = detail.required ?? 0;
  const available = detail.available ?? 0;
  const shortfall = Math.max(required - available, 0);

  const goBuyPack = () => {
    setOpen(false);
    navigate(`${appRoutes.systemBilling}?topup=1${required ? `&required=${required}` : ''}${available ? `&available=${available}` : ''}`);
  };

  const goUpgradePro = () => {
    setOpen(false);
    navigate(`${appRoutes.systemBilling}#plans`);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md bg-[#0f0f13] border-[rgba(249,115,22,0.2)] text-white">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Coins className="h-5 w-5 text-[#f97316]" />
            Out of credits
          </DialogTitle>
          <DialogDescription className="text-zinc-400 text-sm">
            {required > 0 ? (
              <>
                This action requires <span className="text-white font-medium">{required}</span> credits.
                {available > 0 ? (
                  <> You have <span className="text-white font-medium">{available}</span> available
                  {shortfall > 0 ? <> — short by <span className="text-[#f97316] font-medium">{shortfall}</span>.</> : '.'}</>
                ) : (
                  <> You currently have <span className="text-white font-medium">0</span> credits.</>
                )}
              </>
            ) : (
              <>You don&apos;t have enough credits to complete this action. Top up or upgrade your plan to continue.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4 flex-col-reverse sm:flex-row sm:justify-between gap-2">
          <Button
            variant="outline"
            onClick={goBuyPack}
            className="border-[rgba(249,115,22,0.25)] bg-transparent text-white hover:bg-[rgba(249,115,22,0.08)] w-full sm:w-auto"
          >
            <Coins className="mr-2 h-4 w-4" />
            Buy credit pack
          </Button>
          <Button
            onClick={goUpgradePro}
            className="bg-[#f97316] hover:bg-[#ea580c] text-white w-full sm:w-auto"
          >
            <Zap className="mr-2 h-4 w-4" />
            Upgrade to Pro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default InsufficientCreditsDialog;
