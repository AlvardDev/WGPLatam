// Se vuelve a montar en cada navegación: el contenido entra con un fade suave.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">{children}</div>;
}
