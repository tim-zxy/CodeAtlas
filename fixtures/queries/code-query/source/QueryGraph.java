class QueryGraph {
  void root() { left(); right(); unknown(); }
  void left() { leaf(); }
  void right() { leaf(); }
  void leaf() { root(); }
  void run() {}
  void run(int value) {}
  void isolated() {}
}
