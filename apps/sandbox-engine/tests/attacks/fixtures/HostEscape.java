import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;

// P2P Attack Sample 4: Host Filesystem Escape & Unauthorized Access
public class Main {
    public static void main(String[] args) {
        System.out.println("Attempting to access host sensitive files...");
        try {
            // Attempt 1: Read shadow / sensitive host files
            File shadowFile = new File("/etc/shadow");
            if (shadowFile.exists() && shadowFile.canRead()) {
                FileInputStream fis = new FileInputStream(shadowFile);
                System.out.println("VULNERABILITY: Read " + fis.available() + " bytes from /etc/shadow");
                fis.close();
                return;
            }

            // Attempt 2: Write to read-only root system
            File rootFile = new File("/bin/malicious_entry");
            FileOutputStream fos = new FileOutputStream(rootFile);
            fos.write("hacked".getBytes());
            fos.close();
            System.out.println("VULNERABILITY: Successfully wrote to /bin!");
        } catch (Exception e) {
            System.err.println("Permission denied: " + e.getMessage());
            System.exit(1);
        }
    }
}
