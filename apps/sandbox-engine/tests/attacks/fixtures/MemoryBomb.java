import java.util.ArrayList;
import java.util.List;

// P2P Attack Sample 3: Out-Of-Memory / Heap Exhaustion
public class Main {
    public static void main(String[] args) {
        System.out.println("Allocating 1GB+ memory to trigger OOM...");
        List<byte[]> memoryHog = new ArrayList<>();
        while (true) {
            // Allocate 50MB chunks repeatedly to breach 512MB limit
            memoryHog.add(new byte[50 * 1024 * 1024]);
        }
    }
}
