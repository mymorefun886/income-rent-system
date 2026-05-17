import React from 'react';
import { Calendar, AlertCircle, Home } from 'lucide-react';

const UpcomingPayments = ({ payments }) => {
  const getDaysUntilDue = (dueDate) => {
    const today = new Date();
    const due = new Date(dueDate);
    const diffTime = due - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const getUrgencyColor = (daysUntil) => {
    if (daysUntil <= 3) return 'text-red-600 bg-red-50';
    if (daysUntil <= 7) return 'text-yellow-600 bg-yellow-50';
    return 'text-green-600 bg-green-50';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">即将到期付款</h3>
        <AlertCircle className="h-5 w-5 text-orange-500" />
      </div>
      
      <div className="space-y-4">
        {payments.length === 0 ? (
          <p className="text-gray-500 text-center py-8">暂无即将到期的付款</p>
        ) : (
          payments.map((payment) => {
            const daysUntil = getDaysUntilDue(payment.dueDate);
            const urgencyClass = getUrgencyColor(daysUntil);
            
            return (
              <div key={payment.id} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50">
                <div className="flex items-center space-x-4">
                  <div className="p-2 bg-blue-50 rounded-full">
                    <Home className="h-4 w-4 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{payment.tenant}</p>
                    <p className="text-sm text-gray-500">{payment.property}</p>
                  </div>
                </div>
                
                <div className="text-right">
                  <p className="font-semibold text-gray-900">¥{payment.amount.toLocaleString()}</p>
                  <div className="flex items-center space-x-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-500">
                      {new Date(payment.dueDate).toLocaleDateString('zh-CN')}
                    </span>
                  </div>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${urgencyClass}`}>
                    {daysUntil > 0 ? `${daysUntil}天后到期` : daysUntil === 0 ? '今天到期' : '已逾期'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default UpcomingPayments;
