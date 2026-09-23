import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, CarFront } from "lucide-react";
import { money, type Product } from "@/lib/catalog";

const chapters = [
  { id: "", label: "Seu próximo caminho", title: <>O cuidado <br />que move <em>você.</em></>, copy: "Por trás de um carro bem cuidado, existe a peça certa. Descubra o que faz a diferença em cada caminho." },
  { id: "amortecedor", label: "01 / Suspensão", title: <>Mais controle.<br /><em>Mais conforto.</em></>, copy: "O amortecedor ajuda a controlar os movimentos da suspensão e a manter os pneus em contato com o solo. O cuidado que você sente a cada curva." },
  { id: "filtro-ar", label: "02 / Filtragem", title: <>Deixe o motor<br /><em>respirar.</em></>, copy: "O filtro de ar retém impurezas antes que cheguem ao motor. Uma peça pequena, com um papel importante na manutenção do seu carro." },
  { id: "correia", label: "03 / Motor", title: <>Tudo no<br /><em>tempo certo.</em></>, copy: "A correia dentada mantém o movimento do motor em sincronia. Confira o intervalo de troca indicado para seu veículo e cuide antes de precisar parar." },
];
export default function ScrollHero({ products, onProduct }: { products: Product[]; onProduct: (product: Product) => void }) {
  const root = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const progressBar = useRef<HTMLDivElement>(null);
  const controller = useRef<{ update(progress: number): void; dispose(): void } | null>(null);
  const progress = useRef(0);
  const [chapter, setChapter] = useState(0);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & { connection?: EventTarget & { saveData?: boolean } }).connection;
    const preference = () => setReduced(motion.matches || connection?.saveData === true);
    preference(); motion.addEventListener("change", preference);
    connection?.addEventListener("change", preference);
    return () => { motion.removeEventListener("change", preference); connection?.removeEventListener("change", preference); };
  }, []);
  useEffect(() => {
    const target = host.current;
    if (!target) return;
    let disposed = false;
    let started = false;
    const observer = new IntersectionObserver(entries => {
      if (started || !entries.some(entry => entry.isIntersecting)) return;
      started = true;
      void import("./car-film").then(({ mountCarFilm }) => {
        if (disposed) return;
        const film = mountCarFilm(target, () => !disposed && setReady(true), () => !disposed && setUnavailable(true), { endProgress: .7 });
        controller.current = film; film.update(progress.current);
      }).catch(() => !disposed && setUnavailable(true));
    }, { rootMargin: "180px" });
    observer.observe(target);
    return () => { disposed = true; observer.disconnect(); controller.current?.dispose(); controller.current = null; };
  }, []);
  useEffect(() => {
    if (reduced || unavailable) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!root.current) return;
      const rect = root.current.getBoundingClientRect();
      const offset = matchMedia("(max-width:700px)").matches ? 72 : 84;
      const p = Math.min(1, Math.max(0, (offset - rect.top) / Math.max(1, rect.height - innerHeight + offset)));
      progress.current = p;
      controller.current?.update(p);
      if (progressBar.current) progressBar.current.style.transform = `scaleX(${p})`;
      setChapter(p < .19 ? 0 : p < .47 ? 1 : p < .74 ? 2 : 3);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule); schedule();
    return () => { removeEventListener("scroll", schedule); removeEventListener("resize", schedule); cancelAnimationFrame(frame); };
  }, [reduced, unavailable]);
  function choose(index: number) {
    if (reduced || unavailable) { setChapter(index); controller.current?.update(index === 0 ? 0 : .55); return; }
    const rect = root.current?.getBoundingClientRect();
    if (!rect) return;
    const p = [0, .3, .6, .88][index];
    const offset = matchMedia("(max-width:700px)").matches ? 72 : 84;
    scrollTo({ top: scrollY + rect.top - offset + p * (rect.height - innerHeight + offset), behavior: "smooth" });
  }
  const current = chapters[chapter];
  const product = products.find(p => p.id === current.id && p.published);
  return <section ref={root} className={`nl-journey ${reduced || unavailable ? "nl-journey-static" : ""}`} aria-label="Descubra o cuidado por trás de cada peça">
    <h1 className="sr-only">Nova Leões Autopeças — o cuidado que move você</h1>
    <div className="nl-hero-sticky">
      <div className="nl-hero-topline"><span>NOVA LEÕES / AUTOPEÇAS</span><a href="#catalogo">Ir direto às peças <ArrowUpRight size={15} /></a></div>
      <div className="nl-hero-layout">
        <div className="nl-hero-copy" key={chapter}>
          <p className="nl-kicker"><span />{current.label}</p>
          <h2 className={chapter === 0 ? "nl-intro-title" : undefined}>{current.title}</h2>
          <p className="nl-hero-description">{current.copy}</p>
          {product ? <button className="nl-feature-link" onClick={() => onProduct(product)}><img src={product.image} alt="" /><span><small>ENCONTRE NA NOVA LEÕES</small><b>{product.brand.split(" ")[0]} <span>· {money(product.priceCents)}</span></b><span>Ver peça e aplicação <ArrowUpRight size={14} /></span></span></button> : <a className="nl-button" href="#catalogo">Encontrar minha peça <ArrowRight size={18} /></a>}
        </div>
        <div className="nl-car-area">
          <div className="nl-car-canvas" ref={host} role="img" aria-label="Animação ilustrativa de um carro grafite: a carroceria e as rodas se separam durante a rolagem, revelando componentes internos" />
          {!ready && <div className="nl-car-loading"><CarFront size={72} strokeWidth={.8} /><span>{unavailable ? "Conheça as peças nos destaques ao lado" : "Preparando seu próximo caminho…"}</span></div>}
          <span className="nl-film-chapter" hidden={chapter === 0 || !ready}><span />{["", "Suspensão", "Filtro de ar", "Correia dentada"][chapter]}</span>
          <small className="nl-illustration-note">Veículo ilustrativo. Consulte a aplicação de cada peça.</small>
        </div>
      </div>
      <div className="nl-journey-bottom">
        <span className="nl-scroll-hint"><ArrowDown size={16} />{reduced || unavailable ? "Explore os destaques" : "Role para descobrir"}</span>
        <nav aria-label="Destaques do veículo">{chapters.map((item, index) => <button key={item.label} onClick={() => choose(index)} aria-label={item.label} aria-current={chapter === index ? "step" : undefined}><span>0{index + 1}</span><i /></button>)}</nav>
        <span className="nl-chapter-count">0{chapter + 1} <span>/ 04</span></span>
      </div>
      <div className="nl-progress"><div ref={progressBar} /></div>
    </div>
  </section>;
}
