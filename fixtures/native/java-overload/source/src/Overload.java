package demo;
class Overload {
  void choose(int value) {}
  void choose(String value) {}
  void run() { choose(1); }
}
