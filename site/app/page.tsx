import { Hero } from "@/components/hero/Hero";
import { Architecture } from "@/components/sections/Architecture";
import { Developers } from "@/components/sections/Developers";
import { Ecosystem } from "@/components/sections/Ecosystem";
import { Entropy } from "@/components/sections/Entropy";
import { Evidence } from "@/components/sections/Evidence";
import { FinalCta } from "@/components/sections/FinalCta";
import { Gravity } from "@/components/sections/Gravity";
import { History } from "@/components/sections/History";
import { Impact } from "@/components/sections/Impact";
import { OpenSource } from "@/components/sections/OpenSource";
import { Pipeline } from "@/components/sections/Pipeline";
import { Rules } from "@/components/sections/Rules";
import { Footer } from "@/components/site/Footer";
import { Navbar } from "@/components/site/Navbar";

export default function Page() {
  return (
    <>
      <Navbar />
      <main id="main">
        <Hero />
        <Pipeline />
        <Architecture />
        <Gravity />
        <Entropy />
        <Impact />
        <Rules />
        <Evidence />
        <History />
        <Developers />
        <OpenSource />
        <Ecosystem />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
