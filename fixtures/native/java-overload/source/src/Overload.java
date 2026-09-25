package demo;
class Overload {
  void choose(Integer value) {}
  void choose(String value) {}
  void run() { choose(null); }
}
