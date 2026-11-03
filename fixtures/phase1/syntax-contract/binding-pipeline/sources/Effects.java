class Effects {
 void run() {
  for (String item : values) {}
  try (Resource r = open()) {} catch (Exception err) {}
  x++; x += 1;
  Runnable f = () -> work();
 }
}
