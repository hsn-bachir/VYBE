import symbol from '../../assets/symbol.svg'

export function VybeLoader({ label = 'Finding your next story…' }: { label?: string }) {
  return <div className="vybe-loader" role="status"><img src={symbol} alt="" width="172" height="151" /><span>{label}</span></div>
}
