import java.util.ArrayList;
import java.util.List;

public class Ledger {
    private static final class Entry {
        private final String kind;
        private final String detail;

        Entry(String kind, String detail) {
            this.kind = kind;
            this.detail = detail;
        }

        String render() {
            return kind + ":" + detail;
        }
    }

    private final String name;
    private double money;
    private final List<Entry> entries = new ArrayList<>();

    public Ledger(String name, double opening) {
        this.name = name;
        this.money = opening;
        record("OPEN", String.valueOf(opening));
    }

    private void record(String kind, String detail) {
        entries.add(new Entry(kind, detail));
    }

    private static void ensurePositive(double value) {
        if (value <= 0) {
            throw new IllegalArgumentException("Amount must be positive");
        }
    }

    private boolean canCover(double value) {
        return value > 0 && value <= money;
    }

    public void credit(double value) {
        ensurePositive(value);
        money += value;
        record("DEPOSIT", String.valueOf(value));
    }

    public boolean debit(double value) {
        if (!canCover(value)) {
            return false;
        }
        money -= value;
        record("WITHDRAW", String.valueOf(value));
        return true;
    }

    public boolean moveTo(Ledger destination, double value) {
        if (!debit(value)) {
            return false;
        }
        destination.credit(value);
        record("TRANSFER", value + "->" + destination.name);
        return true;
    }

    public void grow(double rate, int periods) {
        for (int step = 0; step < periods; step++) {
            money *= 1 + rate / 100;
        }
        record("INTEREST", String.valueOf(rate));
    }

    public double total() {
        return money;
    }

    public void print() {
        System.out.println("Owner: " + name);
        entries.forEach(e -> System.out.println(" - " + e.render()));
        System.out.println("Balance: " + money);
    }

    public static void main(String[] args) {
        Ledger x = new Ledger("An", 1000);
        Ledger y = new Ledger("Binh", 500);
        x.credit(250);
        x.moveTo(y, 300);
        y.grow(5, 2);
        x.print();
        y.print();
    }
}
