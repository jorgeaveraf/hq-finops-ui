export const permissionNames: Record<string, string> = {
  'client.read': 'View entity in FinOps', 'client.create': 'Create entities',
  'client.update': 'Edit entities', 'client.delete': 'Permanently delete entities',
  'qbo.read': 'Read QuickBooks data (legacy)', 'activity.read': 'View activity history',
  'access.manage': 'Manage people', 'entities.manage': 'Manage entities in FinOps',
  'qbo.entity.read': 'Read QuickBooks data for entity', 'qbo.entity.edit': 'Edit QuickBooks data for entity',
  'qbo.entity.delete': 'Delete QuickBooks data for entity',
  'keys.admin': 'Administer API keys', 'connection.read': 'View connection status',
  'connection.connect': 'Connect QuickBooks', 'connection.check': 'Check connections',
  'connection.rotate': 'Renew connections',
}
const resources: Record<string, string> = {
  account: 'accounts', bank_account: 'bank accounts', bank_transaction: 'bank transactions',
  company: 'company information', customer: 'customers', class: 'classes', department: 'departments',
  vendor: 'vendors', item: 'products and services', invoice: 'invoices', credit_memo: 'credit memos',
  payment: 'payments', payment_method: 'payment methods', sales_receipt: 'sales receipts',
  expense: 'expenses', bill: 'bills', bill_payment: 'bill payments', deposit: 'deposits',
  ar_aging: 'accounts receivable aging', ap_aging: 'accounts payable aging',
  customer_balance: 'customer balances', vendor_balance: 'vendor balances', journal: 'journal',
  profit_and_loss: 'profit and loss', profit_and_loss_detail: 'profit and loss details',
  transaction_list: 'transaction list', balance_sheet: 'balance sheet',
}
export function permissionName(operation: string) {
  if (permissionNames[operation]) return permissionNames[operation]
  if (operation === 'qbo.deposit.link_payment') return 'Link payments to QuickBooks deposits'
  const [area, resource, action] = operation.split('.')
  const verb = ({ read: 'View', list: 'View', create: 'Create', update: 'Edit' } as Record<string, string>)[action]
  if (['qbo', 'report'].includes(area) && resources[resource] && verb) return `${verb} QuickBooks ${resources[resource]}${area === 'report' ? ' report' : ''}`
  return 'Permission description unavailable — contact your administrator'
}
export const roleDescriptions: Record<string, string[]> = {
  Viewer: ['View data*'],
  Operator: ['Edit data*', 'Connect assigned entities to QuickBooks'],
  Admin: ['Delete data*', 'Use granted admin tools'],
}
