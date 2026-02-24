import { Component, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GraphViewComponent } from '@canvas-graph/ng-canvas-graph';
import { MockServer } from '@canvas-graph/mock-server';
import { InteractionMode } from '@canvas-graph/engine';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, GraphViewComponent],
  templateUrl: './app.html',
  styleUrls: ['./app.scss'],
})
export class App implements AfterViewInit {
  @ViewChild('graphView') graphView!: GraphViewComponent;
  
  dataTypes = ['random-walk', 'variable-sine', 'pulse-wave', 'multi-wave', 'sparse-sine'];
  currentDataType = 'random-walk';
  
  currentMode: 'pan' | 'box-zoom' | 'x-zoom' = 'pan';
  private server: MockServer;

  constructor() {
    this.server = new MockServer(100, 100000);
  }

  async ngAfterViewInit() {
    await this.server.init();
    await this.regenerateData(this.currentDataType);
  }

  async regenerateData(type?: string) {
    if (type) {
      this.currentDataType = type;
    }
    await this.server.generateData(this.currentDataType);
    const data = await this.server.getData(0, this.server.nPoints, 1, 100);
    this.graphView.setData(data);
    this.graphView.setRange(0, this.server.nPoints);
  }

  setMode(modeStr: 'pan' | 'box-zoom' | 'x-zoom') {
    this.currentMode = modeStr;
    this.graphView.setMode(modeStr);
  }
}
