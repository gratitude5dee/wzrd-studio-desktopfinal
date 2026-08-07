import { useCredits, CreditTransaction } from '@/hooks/useCredits';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Coins, ArrowLeft, PlusCircle, MinusCircle, RefreshCw } from 'lucide-react';
import { appRoutes } from '@/lib/routes';

const Credits = () => {
  const { availableCredits, isLoading, transactions, refreshTransactions } = useCredits();
  const { user } = useAuth();
  const navigate = useNavigate();

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <div className="text-center p-6 bg-zinc-800 rounded-lg">
          <h1 className="text-xl font-semibold text-white mb-4">Authentication Required</h1>
          <p className="text-zinc-300 mb-6">Please log in to view your credits</p>
          <Button onClick={() => navigate(appRoutes.login)}>Go to Login</Button>
        </div>
      </div>
    );
  }

  const handleBuyCredits = async (_amount: number, _price: string) => {
    // Route all purchases through proper payment flow
    navigate(appRoutes.settings.billing);
  };

  const getTransactionIcon = (transaction: CreditTransaction) => {
    if (transaction.amount > 0) {
      return <PlusCircle className="h-4 w-4 text-orange-500" />;
    } else {
      return <MinusCircle className="h-4 w-4 text-red-500" />;
    }
  };

  const TRANSACTION_LABELS: Record<string, string> = {
    usage: 'Generation',
    purchase: 'Purchase',
    refund: 'Refund',
    bonus: 'Bonus',
    free: 'Free Credits',
  };

  const getTransactionDescription = (transaction: CreditTransaction) => {
    const label = TRANSACTION_LABELS[transaction.transaction_type] || transaction.transaction_type;
    if (transaction.amount > 0) {
      return `${label} — ${transaction.amount} credits`;
    } else {
      return `${label} — ${Math.abs(transaction.amount)} credits (${transaction.resource_type})`;
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0D16]">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center mb-8">
          <Button 
            variant="ghost" 
            className="mr-4 text-white" 
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-white">Credits</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <div className="bg-[#111520] rounded-lg overflow-hidden shadow-lg">
              <div className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold text-white">Your Credit Balance</h2>
                  <div className="flex items-center gap-2 text-white text-2xl font-bold">
                    <Coins className="h-6 w-6 text-yellow-500" />
                    {isLoading ? '...' : availableCredits}
                  </div>
                </div>

                <p className="text-zinc-300 mb-6">
                  Credits are used for AI-generated content like images and videos.
                  Generation costs vary by model and are checked before provider jobs start.
                </p>
              </div>
            </div>

            <div className="mt-8 bg-[#111520] rounded-lg overflow-hidden shadow-lg">
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-white">Transaction History</h2>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="text-zinc-400 hover:text-white"
                    onClick={() => refreshTransactions()}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-4">
                  {transactions.length === 0 ? (
                    <p className="text-zinc-400 text-center py-6">No transactions yet</p>
                  ) : (
                    transactions.map((transaction) => (
                      <div 
                        key={transaction.id} 
                        className="bg-[#1D2130] p-4 rounded-md"
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-3">
                            {getTransactionIcon(transaction)}
                            <div>
                              <div className="text-white font-medium">
                                {getTransactionDescription(transaction)}
                              </div>
                              <div className="text-zinc-400 text-sm">
                                {format(new Date(transaction.created_at), 'MMM d, yyyy • h:mm a')}
                              </div>
                            </div>
                          </div>
                          <div className={`font-semibold ${transaction.amount > 0 ? 'text-orange-500' : 'text-red-500'}`}>
                            {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="md:col-span-1">
            <div className="bg-[#111520] rounded-lg overflow-hidden shadow-lg sticky top-8">
              <div className="p-6">
                <h2 className="text-xl font-semibold text-white mb-4">Buy Credits</h2>
                
                <div className="space-y-4">
                  <div className="bg-[#1D2130] p-4 rounded-md hover:bg-[#2D3140] transition-colors">
                    <div className="flex justify-between items-center mb-2">
                      <div className="text-white font-medium">10 Credits</div>
                      <div className="text-zinc-300">$2.99</div>
                    </div>
                    <Button 
                      className="w-full" 
                      size="sm"
                      onClick={() => handleBuyCredits(10, '$2.99')}
                    >
                      Purchase
                    </Button>
                  </div>
                  
                  <div className="bg-[#1D2130] p-4 rounded-md hover:bg-[#2D3140] transition-colors">
                    <div className="flex justify-between items-center mb-2">
                      <div className="text-white font-medium">50 Credits</div>
                      <div className="text-zinc-300">$9.99</div>
                    </div>
                    <div className="text-xs text-zinc-400 mb-2">Best value</div>
                    <Button 
                      className="w-full" 
                      size="sm"
                      onClick={() => handleBuyCredits(50, '$9.99')}
                    >
                      Purchase
                    </Button>
                  </div>
                  
                  <div className="bg-[#1D2130] p-4 rounded-md hover:bg-[#2D3140] transition-colors">
                    <div className="flex justify-between items-center mb-2">
                      <div className="text-white font-medium">100 Credits</div>
                      <div className="text-zinc-300">$16.99</div>
                    </div>
                    <Button 
                      className="w-full" 
                      size="sm"
                      onClick={() => handleBuyCredits(100, '$16.99')}
                    >
                      Purchase
                    </Button>
                  </div>
                </div>
                
                <div className="mt-6 text-zinc-400 text-xs">
                  <p>Purchases route through the billing page and will use Stripe when live billing is configured.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Credits;
