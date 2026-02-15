import Stats from 'stats.js';

export class Benchmark {
  constructor(container) {
    this.stats = new Stats();
    this.stats.showPanel(0); // 0: fps, 1: ms, 2: mb
    
    // Custom Memory Panel if supported
    if (performance && performance.memory) {
       this.memPanel = this.stats.addPanel( new Stats.Panel( 'MB', '#f8f', '#212' ) );
    }

    this.stats.dom.style.position = 'absolute';
    this.stats.dom.style.top = '0px';
    this.stats.dom.style.left = '0px';
    container.appendChild(this.stats.dom);
  }

  begin() {
    this.stats.begin();
    
    // Update memory panel
    if (this.memPanel && performance.memory) {
        this.memPanel.update( performance.memory.usedJSHeapSize / 1048576, 1000 );
    }
  }

  end() {
    this.stats.end();
  }
}
