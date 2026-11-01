// Contenido curricular y calculadora neuronal interactiva sin cálculos precargados.
import { useState } from 'react';
import { BookOpen, BrainCircuit, Calculator, CircleHelp, FunctionSquare, GitBranch } from 'lucide-react';
import { Heading, SectionTitle } from '../../components/ui';

// Los conceptos del currículo son contenido de referencia; la calculadora no usa ejemplos precargados.
export default function Fundamentals() {
  const [x1, setX1] = useState(0);
  const [x2, setX2] = useState(0);
  const [w1, setW1] = useState(1);
  const [w2, setW2] = useState(1);
  const [bias, setBias] = useState(0);
  const [activation, setActivation] = useState<'relu'|'sigmoid'|'tanh'>('relu');
  const z = x1 * w1 + x2 * w2 + bias;
  const output = activation === 'relu' ? Math.max(0, z) : activation === 'sigmoid' ? 1 / (1 + Math.exp(-z)) : Math.tanh(z);
  const fields = [{ label: 'Entrada x₁', value: x1, setter: setX1 }, { label: 'Peso w₁', value: w1, setter: setW1 }, { label: 'Entrada x₂', value: x2, setter: setX2 }, { label: 'Peso w₂', value: w2, setter: setW2 }, { label: 'Sesgo b', value: bias, setter: setBias }];
  return <>
    <Heading eyebrow="Aprendizaje · M03 · Semana 11" title="Fundamentos neuronales" description="Comprende las neuronas, sus conexiones y las funciones de activación mediante una calculadora interactiva."/>
    <div className="grid gap-5 lg:grid-cols-[1fr_1.15fr]">
      <section className="panel p-6"><SectionTitle title="Anatomía de una red" subtitle="Conceptos esenciales de la estructura neuronal"/>
        <div className="space-y-5">{[
          { icon: BrainCircuit, name: 'Neurona artificial', body: 'Unidad computacional que combina entradas, pesos y un sesgo antes de aplicar una función de activación.' },
          { icon: GitBranch, name: 'Capas y conexiones', body: 'Las neuronas se organizan en capas de entrada, ocultas y salida. Los pesos determinan la contribución de cada conexión.' },
          { icon: FunctionSquare, name: 'Función de activación', body: 'Transforma la suma ponderada e introduce no linealidad. ReLU, tanh y sigmoide son opciones habituales.' },
          { icon: CircleHelp, name: 'Familias de redes', body: 'Feedforward procesa entradas hacia delante; RNN modela secuencias; CNN explota patrones espaciales; GAN enfrenta dos redes durante el aprendizaje.' },
        ].map(item => <div key={item.name} className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-600"><item.icon size={19}/></div><div><h3 className="font-semibold text-ink">{item.name}</h3><p className="mt-1 text-sm leading-6 text-slate-500">{item.body}</p></div></div>)}</div>
      </section>
      <section className="panel p-6"><div className="mb-5 flex items-start justify-between gap-3"><SectionTitle title="Laboratorio de una neurona" subtitle="Modifica entradas y pesos; observa el cálculo real"/><div className="rounded-xl bg-emerald-50 p-2 text-emerald-700"><Calculator size={21}/></div></div>
        <div className="mb-5 flex justify-center rounded-xl border border-slate-100 bg-slate-50 p-5"><svg viewBox="0 0 350 142" className="h-36 w-full max-w-md" role="img" aria-label="Dos entradas se conectan a una neurona y producen una salida"><line x1="62" y1="36" x2="156" y2="72" stroke="#9bb0db" strokeWidth="2.5"/><line x1="62" y1="108" x2="156" y2="72" stroke="#9bb0db" strokeWidth="2.5"/><line x1="197" y1="72" x2="290" y2="72" stroke="#10a991" strokeWidth="2.5"/><circle cx="50" cy="36" r="22" fill="#e8eeff" stroke="#9bb0db"/><circle cx="50" cy="108" r="22" fill="#e8eeff" stroke="#9bb0db"/><circle cx="176" cy="72" r="28" fill="#526fea"/><circle cx="312" cy="72" r="25" fill="#e8faf5" stroke="#10a991"/><text x="50" y="41" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#3447ab">x₁</text><text x="50" y="113" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#3447ab">x₂</text><text x="176" y="77" textAnchor="middle" fontSize="12" fontWeight="bold" fill="white">f(z)</text><text x="312" y="76" textAnchor="middle" fontSize="11" fontWeight="bold" fill="#0f8e7e">ŷ</text></svg></div>
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">{fields.map(field => <label key={field.label} className="block"><span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-600"><span>{field.label}</span><output className="font-mono text-primary-600">{field.value.toFixed(1)}</output></span><input className="w-full accent-[#526fea]" type="range" min="-3" max="3" step="0.1" value={field.value} onChange={e => field.setter(Number(e.target.value))}/></label>)}</div>
        <div className="mt-5"><label className="field-label" htmlFor="neuron-activation">Activación</label><select id="neuron-activation" className="field" value={activation} onChange={e => setActivation(e.target.value as typeof activation)}><option value="relu">ReLU</option><option value="sigmoid">Sigmoide</option><option value="tanh">tanh</option></select></div>
        <div className="mt-5 rounded-xl bg-[#142647] p-5 text-white"><div className="text-xs font-medium text-blue-200">z = x₁·w₁ + x₂·w₂ + b = {z.toFixed(4)}</div><div className="mt-2 flex items-center justify-between"><span className="text-sm text-blue-100">Salida f(z)</span><span className="font-mono text-3xl font-bold">{output.toFixed(4)}</span></div></div>
      </section>
    </div>
    <div className="mt-5 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500"><BookOpen size={20} className="shrink-0 text-primary-600"/> Este módulo representa los fundamentos curriculares. La calculadora es independiente del entrenamiento de modelos y no genera métricas de prueba ficticias.</div>
  </>;
}
