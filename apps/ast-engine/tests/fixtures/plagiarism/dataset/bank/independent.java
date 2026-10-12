import java.util.ArrayDeque;
import java.util.Deque;

public class SavingsAccount {
    private long cents;
    private final String id;
    private final Deque<Long> recent = new ArrayDeque<>();

    public SavingsAccount(String id) {
        this.id = id;
    }

    public void add(long amountCents) {
        if (amountCents < 0) {
            return;
        }
        cents += amountCents;
        remember(amountCents);
    }

    public long remove(long amountCents) {
        long taken = Math.min(amountCents, cents);
        cents -= taken;
        remember(-taken);
        return taken;
    }

    private void remember(long delta) {
        recent.addFirst(delta);
        if (recent.size() > 5) {
            recent.removeLast();
        }
    }

    public String summary() {
        return String.format("%s has %d.%02d", id, cents / 100, cents % 100);
    }

    public static void main(String[] args) {
        SavingsAccount acc = new SavingsAccount("ACC-1");
        acc.add(12050);
        acc.remove(3000);
        System.out.println(acc.summary());
        System.out.println(acc.recent);
    }
}
