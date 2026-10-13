// P2P Attack Sample 2: Infinite CPU Loop / Hang
public class Main {
    public static void main(String[] args) {
        System.out.println("Entering infinite loop...");
        long count = 0;
        while (true) {
            count++;
        }
    }
}
