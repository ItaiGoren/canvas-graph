export class Renderer {
  constructor(container, viewport) {
    this.container = container;
    this.viewport = viewport;
    this.width = container.clientWidth;
    this.height = container.clientHeight;
    this.lineWidth = 1;
  }

  async init() {
    throw new Error('Method not implemented.');
  }

  render() {
    throw new Error('Method not implemented.');
  }

  setData(data) {
     throw new Error('Method not implemented.');
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }
  
  destroy() {
      // cleanup
  }
}
